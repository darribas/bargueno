import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Dialog, ICommandPalette, InputDialog, showDialog } from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { Contents } from '@jupyterlab/services';
import { IStatusBar } from '@jupyterlab/statusbar';
import { Widget } from '@lumino/widgets';

import { pickFile, shareOrDownload } from './files';
import { IProjects, Projects, SETTINGS_FILE } from './project';
import { cleanProjectName, exists, unzipProject, writeProject, zipProject } from './zip';

namespace CommandIDs {
  export const newProject = 'bargueno:new-project';
  export const exportProject = 'bargueno:export-project';
  export const importProject = 'bargueno:import-project';
}

/** Set once the example has been unpacked, so deleting it sticks. */
const SEEDED_KEY = 'bargueno:example-seeded';
const EXAMPLE_ZIP = 'bargueno/example.zip';

const STARTER: Record<string, string> = {
  [SETTINGS_FILE]: [
    '# Bargueño project settings',
    'compute: false        # true loads a Python kernel for code cells',
    'template: article     # default manuscript template',
    'citation-style: apa',
    ''
  ].join('\n'),
  'paper.md': [
    '---',
    'title: Untitled',
    'authors:',
    '  - name: Your Name',
    '---',
    '',
    '# Introduction',
    '',
    'Start writing here.',
    ''
  ].join('\n'),
  'references.bib': '',
  '.gitignore': '_exports/\n'
};

export const projectsPlugin: JupyterFrontEndPlugin<IProjects> = {
  id: 'bargueno:projects',
  description: 'Projects (top-level folders), their bargueno.yml, and zip import/export.',
  autoStart: true,
  provides: IProjects,
  requires: [ILabShell],
  optional: [ICommandPalette, IStatusBar, IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    shell: ILabShell,
    palette: ICommandPalette | null,
    statusBar: IStatusBar | null,
    browser: IDefaultFileBrowser | null
  ): IProjects => {
    const { commands } = app;
    const contents = app.serviceManager.contents;
    const projects = new Projects(contents);

    // First launch: unpack the example project into ordinary storage.
    void seedExample(contents)
      .catch(err => console.warn('bargueno: could not add the example project', err))
      .then(() => projects.refresh())
      .finally(() => (document.body.dataset.barguenoReady = 'true'));

    // SPEC: ask once for storage that the browser will not evict under
    // pressure. Safari grants it more readily to Home Screen apps.
    void navigator.storage?.persist?.().catch(() => undefined);

    const currentPath = (): string | undefined =>
      (shell.currentWidget as IDocumentWidget | null)?.context?.path;

    /**
     * Project of the active document; failing that, of the file browser's
     * folder or its selected project folder.
     */
    const currentProject = (): string | null => {
      const fromDoc = projects.projectOf(currentPath());
      if (fromDoc || !browser) {
        return fromDoc;
      }
      const cwd = browser.model.path.split('/').filter(Boolean)[0];
      if (cwd) {
        return cwd;
      }
      const selected = browser.selectedItems().next();
      const item = selected.done ? undefined : selected.value;
      return item?.type === 'directory' && !item.path.includes('/') ? item.path : null;
    };

    commands.addCommand(CommandIDs.newProject, {
      label: 'New Project…',
      execute: async args => {
        let name = args.name as string | undefined;
        if (!name) {
          const result = await InputDialog.getText({ title: 'New project', placeholder: 'my-paper' });
          if (!result.button.accept || !result.value) {
            return;
          }
          name = result.value;
        }
        const project = cleanProjectName(name);
        if (!project || (await exists(contents, project))) {
          throw new Error(`Cannot create project "${name}": it exists or the name is empty.`);
        }
        const encoder = new TextEncoder();
        await writeProject(
          contents,
          project,
          new Map(Object.entries(STARTER).map(([k, v]) => [k, encoder.encode(v)]))
        );
        await projects.refresh();
        await commands.execute('docmanager:open', { path: `${project}/paper.md` });
        return project;
      }
    });

    commands.addCommand(CommandIDs.exportProject, {
      label: args => (args.project ? `Export Project "${args.project}" as Zip` : 'Export Project as Zip'),
      caption: 'Zip the current project (without _exports/) for Working Copy or Files',
      isEnabled: args => !!(args.project || currentProject()),
      execute: async args => {
        const project = (args.project as string | undefined) ?? currentProject();
        if (!project) {
          return;
        }
        const zip = await zipProject(contents, project, {
          includeExports: !!args.includeExports
        });
        const file = new File([zip as BlobPart], `${project}.zip`, { type: 'application/zip' });
        await shareOrDownload(file);
        return file.name;
      }
    });

    commands.addCommand(CommandIDs.importProject, {
      label: 'Import Project from Zip…',
      caption: 'Unpack a zipped project (for example from Working Copy) into a project folder',
      execute: async args => {
        const file = (args.file as File | undefined) ?? (await pickFile('.zip,application/zip'));
        if (!file) {
          return;
        }
        const { name, files } = unzipProject(new Uint8Array(await file.arrayBuffer()));
        const project = cleanProjectName((args.name as string) || name || file.name);
        if (!project || files.size === 0) {
          throw new Error(`${file.name} has no files to import.`);
        }
        if (await exists(contents, project)) {
          const replace =
            args.replace === true ||
            (
              await showDialog({
                title: 'Replace project?',
                body: `A project called "${project}" already exists. Replace all of its files with the contents of ${file.name}?`,
                buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Replace' })]
              })
            ).button.accept;
          if (!replace) {
            return;
          }
          await closeDocumentsIn(project);
          await contents.delete(project);
        }
        await writeProject(contents, project, files);
        await projects.refresh();
        return project;
      }
    });

    /** Close open documents in a project before its files are replaced. */
    const closeDocumentsIn = async (project: string): Promise<void> => {
      for (const widget of [...shell.widgets('main')]) {
        const path = (widget as IDocumentWidget).context?.path;
        if (path && projects.projectOf(path) === project) {
          widget.close();
        }
      }
    };

    if (palette) {
      const category = 'Bargueño';
      for (const command of Object.values(CommandIDs)) {
        palette.addItem({ command, category });
      }
    }

    if (statusBar) {
      const item = new Widget();
      item.addClass('bq-ProjectStatus');
      const update = () => {
        const project = projects.projectOf(currentPath());
        item.node.textContent = project ?? '';
        item.node.title = project ? `Project: ${project}` : '';
      };
      shell.currentChanged.connect(update);
      projects.changed.connect(update);
      statusBar.registerStatusItem('bargueno:project', {
        item,
        align: 'left',
        rank: -1
      });
      update();
    }

    return projects;
  }
};

async function seedExample(contents: Contents.IManager): Promise<void> {
  const flag = {
    get: () => {
      try {
        return localStorage.getItem(SEEDED_KEY) === '1';
      } catch {
        return false;
      }
    },
    set: () => {
      try {
        localStorage.setItem(SEEDED_KEY, '1');
      } catch {
        // Private browsing: the example may come back next launch.
      }
    }
  };
  if (flag.get()) {
    return;
  }
  const response = await fetch(URLExt.join(PageConfig.getBaseUrl(), EXAMPLE_ZIP));
  if (!response.ok) {
    return;
  }
  const { name, files } = unzipProject(new Uint8Array(await response.arrayBuffer()));
  const project = name ?? 'example';
  if (!(await exists(contents, project))) {
    await writeProject(contents, project, files);
  }
  flag.set();
}

