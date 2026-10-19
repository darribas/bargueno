import { PathExt } from '@jupyterlab/coreutils';
import { Contents } from '@jupyterlab/services';
import { Token } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { load as loadYaml } from 'js-yaml';

/** Project settings file, at the root of every project folder. */
export const SETTINGS_FILE = 'bargueno.yml';

export interface IProjectSettings {
  /** Load a kernel and allow running code (SPEC: off by default). */
  compute: boolean;
  /** Default manuscript template; frontmatter `template:` wins. */
  template: string;
  /** Default citation style (milestone 6). */
  citationStyle: string;
}

export const DEFAULT_SETTINGS: Readonly<IProjectSettings> = {
  compute: false,
  template: 'article',
  citationStyle: 'apa'
};

/**
 * Projects are the top-level folders of the app's storage. Each may carry a
 * `bargueno.yml`; the parsed settings are cached so callers can read them
 * synchronously, and refreshed whenever a project or its settings change.
 */
export interface IProjects {
  readonly ready: Promise<void>;
  readonly changed: ISignal<IProjects, void>;
  /** Project names, sorted. */
  list(): string[];
  /** The project a path belongs to, or null for files at the root. */
  projectOf(path: string | undefined): string | null;
  settings(project: string | null): IProjectSettings;
  /** Why a project's settings file could not be used, if it could not. */
  error(project: string): string | undefined;
  refresh(): Promise<void>;
}

export const IProjects = new Token<IProjects>(
  'bargueno:IProjects',
  'Bargueño projects and their bargueno.yml settings.'
);

export function projectOf(path: string | undefined): string | null {
  if (!path) {
    return null;
  }
  const parts = PathExt.normalize(path).split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : null;
}

/** Parse a bargueno.yml; unknown keys are ignored, bad values fall back. */
export function parseSettings(text: string): IProjectSettings {
  const raw = (loadYaml(text) ?? {}) as Record<string, unknown>;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${SETTINGS_FILE} must be a mapping of keys to values`);
  }
  const pick = (...keys: string[]) => keys.map(k => raw[k]).find(v => v !== undefined);
  const compute = pick('compute');
  const template = pick('template');
  const style = pick('citation-style', 'citation_style', 'citationStyle');
  return {
    compute: typeof compute === 'boolean' ? compute : DEFAULT_SETTINGS.compute,
    template: typeof template === 'string' && template ? template : DEFAULT_SETTINGS.template,
    citationStyle: typeof style === 'string' && style ? style : DEFAULT_SETTINGS.citationStyle
  };
}

export class Projects implements IProjects {
  constructor(private readonly _contents: Contents.IManager) {
    this.ready = this.refresh();
    _contents.fileChanged.connect(this._onFileChanged, this);
  }

  readonly ready: Promise<void>;

  get changed(): ISignal<IProjects, void> {
    return this._changed;
  }

  list(): string[] {
    return [...this._settings.keys()].sort();
  }

  projectOf(path: string | undefined): string | null {
    return projectOf(path);
  }

  settings(project: string | null): IProjectSettings {
    return (project && this._settings.get(project)) || { ...DEFAULT_SETTINGS };
  }

  error(project: string): string | undefined {
    return this._errors.get(project);
  }

  async refresh(): Promise<void> {
    const root = await this._contents.get('', { content: true });
    const dirs = (root.content as Contents.IModel[])
      .filter(m => m.type === 'directory')
      .map(m => m.name);
    const loaded = await Promise.all(dirs.map(dir => this._load(dir)));
    this._settings = new Map(dirs.map((dir, i) => [dir, loaded[i]]));
    this._changed.emit();
  }

  private async _load(project: string): Promise<IProjectSettings> {
    this._errors.delete(project);
    let text: string;
    try {
      const model = await this._contents.get(PathExt.join(project, SETTINGS_FILE), {
        content: true,
        type: 'file',
        format: 'text'
      });
      text = String(model.content ?? '');
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
    try {
      return parseSettings(text);
    } catch (err) {
      this._errors.set(project, (err as Error).message);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private _onFileChanged(_: unknown, change: Contents.IChangedArgs): void {
    const paths = [change.oldValue?.path, change.newValue?.path].filter(
      (p): p is string => !!p
    );
    const relevant = paths.some(p => {
      const parts = PathExt.normalize(p).split('/').filter(Boolean);
      return parts.length === 1 || (parts.length === 2 && parts[1] === SETTINGS_FILE);
    });
    if (relevant) {
      void this.refresh().catch(err => console.warn('bargueno: projects refresh failed', err));
    }
  }

  private _settings = new Map<string, IProjectSettings>();
  private _errors = new Map<string, string>();
  private _changed = new Signal<IProjects, void>(this);
}
