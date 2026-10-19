import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette, MainAreaWidget, WidgetTracker } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';
import { Contents } from '@jupyterlab/services';
import { ToolbarButton } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';

import { kernelPolicyPlugin } from './kernel';
import {
  buildInput,
  bytesToBase64,
  compilePdf,
  EXPORT_DIR,
  isManuscript,
  TypstPreview
} from './preview';

namespace CommandIDs {
  export const preview = 'bargueno:preview';
  export const refresh = 'bargueno:refresh-preview';
  export const exportPdf = 'bargueno:export-pdf';
  export const exportTypst = 'bargueno:export-typst';
}

type PreviewWidget = MainAreaWidget<TypstPreview>;

const typstPlugin: JupyterFrontEndPlugin<void> = {
  id: 'bargueno:typst',
  description: 'Typst preview pane and PDF / Typst exports for manuscripts.',
  autoStart: true,
  requires: [ILabShell],
  optional: [ICommandPalette],
  activate: (app: JupyterFrontEnd, shell: ILabShell, palette: ICommandPalette | null) => {
    const { commands, docRegistry } = app;
    const contents = app.serviceManager.contents;
    const previews = new WidgetTracker<PreviewWidget>({ namespace: 'bargueno-preview' });

    docRegistry.addFileType({
      name: 'typst',
      displayName: 'Typst',
      extensions: ['.typ'],
      mimeTypes: ['text/x-typst'],
      fileFormat: 'text',
      contentType: 'file'
    });

    /** The manuscript the user is looking at: an editor, or a preview's source. */
    const currentSource = (): DocumentRegistry.Context | null => {
      const widget = shell.currentWidget;
      if (widget && previews.has(widget)) {
        return (widget as PreviewWidget).content.source;
      }
      const context = (widget as IDocumentWidget | null)?.context;
      return context && isManuscript(context.path) ? context : null;
    };

    const findPreview = (path: string) => previews.find(w => w.content.path === path);

    commands.addCommand(CommandIDs.preview, {
      label: 'Preview Manuscript',
      caption: 'Typeset the current manuscript with Typst',
      isEnabled: () => currentSource() !== null,
      execute: async () => {
        const source = currentSource();
        if (!source) {
          return;
        }
        let widget = findPreview(source.path);
        if (!widget) {
          const content = new TypstPreview(source, contents);
          widget = new MainAreaWidget({ content });
          widget.id = `bargueno-preview-${Private.id++}`;
          widget.title.label = `Preview: ${PathExt.basename(source.path)}`;
          widget.title.closable = true;
          widget.toolbar.addItem('refresh', button('Refresh', CommandIDs.refresh, app));
          widget.toolbar.addItem('pdf', button('PDF', CommandIDs.exportPdf, app));
          const ref = shell.currentWidget?.id;
          shell.add(widget, 'main', { mode: 'split-right', ref });
          void previews.add(widget);
        } else {
          shell.activateById(widget.id);
        }
        await widget.content.refresh();
      }
    });

    commands.addCommand(CommandIDs.refresh, {
      label: 'Refresh Preview',
      isEnabled: () => !!currentSource(),
      execute: async () => {
        const source = currentSource();
        const widget = source && findPreview(source.path);
        if (widget) {
          await widget.content.refresh();
        } else if (source) {
          await commands.execute(CommandIDs.preview);
        }
      }
    });

    commands.addCommand(CommandIDs.exportPdf, {
      label: 'Export Manuscript as PDF',
      isEnabled: () => currentSource() !== null,
      execute: async () => {
        const source = currentSource();
        if (!source) {
          return;
        }
        const { pdf, problems } = await compilePdf(
          source.path,
          source.model.toString(),
          contents
        );
        if (!pdf) {
          throw new Error(`Typst could not compile ${source.path}:\n${problems.join('\n')}`);
        }
        const path = await writeExport(contents, source.path, '.pdf', {
          format: 'base64',
          content: bytesToBase64(pdf)
        });
        download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), PathExt.basename(path));
        return path;
      }
    });

    commands.addCommand(CommandIDs.exportTypst, {
      label: 'Export Manuscript as Typst Source',
      isEnabled: () => {
        const source = currentSource();
        return !!source && !source.path.toLowerCase().endsWith('.typ');
      },
      execute: async () => {
        const source = currentSource();
        if (!source) {
          return;
        }
        const { standalone } = await buildInput(source.path, source.model.toString(), contents);
        const path = await writeExport(contents, source.path, '.typ', {
          format: 'text',
          content: standalone
        });
        download(new Blob([standalone], { type: 'text/x-typst' }), PathExt.basename(path));
        return path;
      }
    });

    // A plain-text "Preview" button on editors showing a manuscript.
    docRegistry.addWidgetExtension('Editor', {
      createNew: (widget: IDocumentWidget, context: DocumentRegistry.Context) => {
        if (!isManuscript(context.path)) {
          return;
        }
        const item = button('Preview', CommandIDs.preview, app);
        widget.toolbar.insertItem(10, 'bargueno-preview', item);
        return item;
      }
    });

    shell.currentChanged.connect(() => commands.notifyCommandChanged());

    if (palette) {
      const category = 'Bargueño';
      for (const command of Object.values(CommandIDs)) {
        palette.addItem({ command, category });
      }
    }
  }
};

function button(label: string, command: string, app: JupyterFrontEnd): Widget {
  return new ToolbarButton({
    label,
    tooltip: app.commands.caption(command) || app.commands.label(command),
    onClick: () => void app.commands.execute(command)
  });
}

/** Save an export next to its source, in `_exports/`, and return its path. */
async function writeExport(
  contents: Contents.IManager,
  sourcePath: string,
  ext: string,
  body: { format: 'text' | 'base64'; content: string }
): Promise<string> {
  const dir = PathExt.join(PathExt.dirname(sourcePath), EXPORT_DIR);
  try {
    await contents.get(dir, { content: false });
  } catch {
    const created = await contents.newUntitled({
      path: PathExt.dirname(sourcePath),
      type: 'directory'
    });
    await contents.rename(created.path, dir);
  }
  const stem = PathExt.basename(sourcePath, PathExt.extname(sourcePath));
  const path = PathExt.join(dir, stem + ext);
  await contents.save(path, { type: 'file', ...body });
  return path;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

namespace Private {
  export let id = 0;
}

export default [kernelPolicyPlugin, typstPlugin];
