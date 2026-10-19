import { PathExt } from '@jupyterlab/coreutils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Contents } from '@jupyterlab/services';
import { Widget } from '@lumino/widgets';

import type { ICompileInput, IDiagnostic, TypstEngine } from './engine';

export const EXPORT_DIR = '_exports';

/** Files the Typst pipeline can preview and export. */
export function isManuscript(path: string | undefined): boolean {
  return !!path && /\.(md|typ)$/i.test(path);
}

let engine: Promise<TypstEngine> | null = null;

/** The Typst engine and MyST converter load on first use, not at startup. */
function getEngine(): Promise<TypstEngine> {
  if (!engine) {
    engine = import('./engine').then(m => new m.TypstEngine());
    engine.catch(() => (engine = null));
  }
  return engine;
}

/**
 * Turn a source document into Typst compile input: raw .typ passes through,
 * anything else goes through the MyST AST.
 */
export async function buildInput(
  path: string,
  text: string,
  contents: Contents.IManager
): Promise<{ input: ICompileInput; warnings: string[]; standalone: string }> {
  if (path.toLowerCase().endsWith('.typ')) {
    return { input: { main: text }, warnings: [], standalone: text };
  }
  const [{ mystToTypstDocument, TEMPLATE_DIR }, { TEMPLATES }] = await Promise.all([
    import('./myst'),
    import('./templates')
  ]);
  const doc = mystToTypstDocument(text, path);
  const templatePath = `${TEMPLATE_DIR}/${doc.template}.typ`;
  const files: Record<string, Uint8Array> = {};
  const warnings = [...doc.warnings];
  const dir = PathExt.dirname(path);
  await Promise.all(
    doc.images.map(async url => {
      const local = PathExt.normalize(PathExt.join(dir, url));
      try {
        const model = await contents.get(local, { content: true, format: 'base64' });
        files[`/${PathExt.normalize(url)}`] = base64ToBytes(String(model.content));
      } catch {
        warnings.push(`Image not found: ${url}`);
      }
    })
  );
  // The exported .typ inlines the template so it compiles on its own.
  const standalone = doc.source.replace(
    `#import "${templatePath}": ${doc.template}`,
    TEMPLATES[doc.template].trim()
  );
  return {
    input: { main: doc.source, sources: { [templatePath]: TEMPLATES[doc.template] }, files },
    warnings,
    standalone
  };
}

export async function compilePdf(
  path: string,
  text: string,
  contents: Contents.IManager
): Promise<{ pdf?: Uint8Array; problems: string[] }> {
  const { input, warnings } = await buildInput(path, text, contents);
  const out = await (await getEngine()).pdf(input);
  return { pdf: out.result, problems: [...warnings, ...formatDiagnostics(out.diagnostics)] };
}

/**
 * SVG preview of a manuscript. It follows its source document and refreshes
 * when asked or when the source is saved, never on every keystroke.
 */
export class TypstPreview extends Widget {
  constructor(
    readonly source: DocumentRegistry.Context,
    private readonly _contents: Contents.IManager
  ) {
    super();
    this.addClass('bq-Preview');
    this._status = document.createElement('div');
    this._status.className = 'bq-Preview-status';
    this._problems = document.createElement('pre');
    this._problems.className = 'bq-Preview-problems';
    this._pages = document.createElement('div');
    this._pages.className = 'bq-Preview-pages';
    this.node.append(this._status, this._problems, this._pages);
    this.node.tabIndex = -1;

    source.saveState.connect(this._onSaveState, this);
    source.disposed.connect(() => this.dispose());
  }

  get path(): string {
    return this.source.path;
  }

  /** Recompile from the editor's current text, saved or not. */
  async refresh(): Promise<void> {
    const run = ++this._run;
    this._setStatus('Typesetting…');
    try {
      const text = this.source.model.toString();
      const { input, warnings } = await buildInput(this.path, text, this._contents);
      const out = await (await getEngine()).svg(input);
      if (run !== this._run || this.isDisposed) {
        return;
      }
      if (out.result) {
        this._pages.innerHTML = out.result;
      }
      const problems = [...warnings, ...formatDiagnostics(out.diagnostics)];
      this._problems.textContent = problems.join('\n');
      this._problems.hidden = problems.length === 0;
      this._setStatus(
        out.result
          ? `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Typst could not compile this document'
      );
      this.node.dataset.state = out.result ? 'ready' : 'error';
    } catch (err) {
      if (run !== this._run || this.isDisposed) {
        return;
      }
      console.error('bargueno: preview failed', err);
      this._problems.textContent = String(err);
      this._problems.hidden = false;
      this._setStatus('Preview failed');
      this.node.dataset.state = 'error';
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.source.saveState.disconnect(this._onSaveState, this);
    super.dispose();
  }

  private _onSaveState(_: unknown, state: DocumentRegistry.SaveState): void {
    if (state === 'completed') {
      void this.refresh();
    }
  }

  private _setStatus(text: string): void {
    this._status.textContent = text;
  }

  private _status: HTMLElement;
  private _problems: HTMLElement;
  private _pages: HTMLElement;
  private _run = 0;
}

function formatDiagnostics(diagnostics: IDiagnostic[]): string[] {
  return diagnostics.map(d => {
    const where = d.path ? `${d.path.replace(/^\//, '')}${d.range ? ` ${d.range}` : ''}: ` : '';
    return `${d.severity}: ${where}${d.message}`;
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
