import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { CompileFormatEnum } from '@myriaddreamin/typst.ts/compiler';
import {
  createTypstCompiler,
  createTypstRenderer,
  type TypstCompiler,
  type TypstRenderer
} from '@myriaddreamin/typst.ts';
import {
  disableDefaultFontAssets,
  loadFonts
} from '@myriaddreamin/typst.ts/dist/esm/options.init.mjs';

/** Where scripts/postbuild.py puts the WASM modules and fonts. */
const ASSETS = 'bargueno/typst';

/** Bundled fonts; Typst's defaults, so plain .typ files look as expected. */
export const FONTS = [
  'LibertinusSerif-Regular.otf',
  'LibertinusSerif-Italic.otf',
  'LibertinusSerif-Bold.otf',
  'LibertinusSerif-BoldItalic.otf',
  'NewCMMath-Regular.otf',
  'DejaVuSansMono.ttf',
  'DejaVuSansMono-Bold.ttf'
];

const MAIN = '/main.typ';

export interface IDiagnostic {
  severity: string;
  path: string;
  range: string;
  message: string;
}

export interface ICompileInput {
  /** Source of the main file. */
  main: string;
  /** Extra source files (absolute virtual paths), e.g. templates. */
  sources?: Record<string, string>;
  /** Binary files (absolute virtual paths), e.g. images. */
  files?: Record<string, Uint8Array>;
}

export interface ICompileOutput<T> {
  result?: T;
  diagnostics: IDiagnostic[];
}

function assetUrl(name: string): string {
  return URLExt.join(PageConfig.getBaseUrl(), ASSETS, name);
}

/**
 * One compiler and renderer for the whole app. Calls are serialised because
 * the compiler's virtual file system is shared state.
 */
export class TypstEngine {
  private _compiler: TypstCompiler | null = null;
  private _renderer: TypstRenderer | null = null;
  private _ready: Promise<void> | null = null;
  private _queue: Promise<unknown> = Promise.resolve();

  ready(): Promise<void> {
    if (!this._ready) {
      this._ready = this._init();
      this._ready.catch(() => (this._ready = null));
    }
    return this._ready;
  }

  /** Compile to SVG markup, one string for the whole document. */
  async svg(input: ICompileInput): Promise<ICompileOutput<string>> {
    const out = await this._compile(input, CompileFormatEnum.vector);
    if (!out.result) {
      return { diagnostics: out.diagnostics };
    }
    const svg = await this._renderer!.renderSvg({
      format: 'vector',
      artifactContent: out.result
    });
    return { result: svg, diagnostics: out.diagnostics };
  }

  pdf(input: ICompileInput): Promise<ICompileOutput<Uint8Array>> {
    return this._compile(input, CompileFormatEnum.pdf);
  }

  private async _init(): Promise<void> {
    const compiler = createTypstCompiler();
    const renderer = createTypstRenderer();
    const fonts = FONTS.map(assetUrl);
    await Promise.all([
      compiler.init({
        getModule: () => assetUrl('typst_ts_web_compiler_bg.wasm'),
        beforeBuild: [disableDefaultFontAssets(), loadFonts(fonts)]
      }),
      renderer.init({
        getModule: () => assetUrl('typst_ts_renderer_bg.wasm')
      })
    ]);
    this._compiler = compiler;
    this._renderer = renderer;
  }

  private _compile(
    input: ICompileInput,
    format: CompileFormatEnum.vector | CompileFormatEnum.pdf
  ): Promise<ICompileOutput<Uint8Array>> {
    const run = async (): Promise<ICompileOutput<Uint8Array>> => {
      await this.ready();
      const compiler = this._compiler!;
      compiler.resetShadow();
      compiler.addSource(MAIN, input.main);
      for (const [path, source] of Object.entries(input.sources ?? {})) {
        compiler.addSource(path, source);
      }
      for (const [path, data] of Object.entries(input.files ?? {})) {
        compiler.mapShadow(path, data);
      }
      const out = await compiler.compile({
        mainFilePath: MAIN,
        format,
        diagnostics: 'full'
      });
      return {
        result: out.result ?? undefined,
        diagnostics: (out.diagnostics ?? []) as IDiagnostic[]
      };
    };
    const next = this._queue.then(run, run);
    this._queue = next.catch(() => undefined);
    return next;
  }
}
