import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { IDisposable } from '@lumino/disposable';

import { IProjects } from './project';

/**
 * Notebook widget factories that ask for a kernel when a document opens.
 * `Slideshow` comes from jupyterlab-myst-revealjs.
 */
const NOTEBOOK_FACTORIES = ['Notebook', 'Slideshow'];

/**
 * Compute is off unless the project's bargueno.yml says `compute: true` and
 * a kernel exists. While it is off, opening a notebook must not start a
 * kernel or ask which one to start; otherwise JupyterLab shows a "Select
 * Kernel" dialog for every notebook in a kernel-less build.
 */
export const kernelPolicyPlugin: JupyterFrontEndPlugin<void> = {
  id: 'bargueno:kernel-policy',
  description: 'Open notebooks without starting or asking for a kernel.',
  autoStart: true,
  requires: [IProjects],
  activate: (app: JupyterFrontEnd, projects: IProjects) => {
    const specs = app.serviceManager.kernelspecs;
    const noKernels = () =>
      Object.keys(specs.specs?.kernelspecs ?? {}).length === 0;

    const extension: DocumentRegistry.WidgetExtension = {
      createNew: (_widget, context): IDisposable | void => {
        const { compute } = projects.settings(projects.projectOf(context.path));
        if (!compute || noKernels()) {
          const session = context.sessionContext;
          session.kernelPreference = {
            ...session.kernelPreference,
            shouldStart: false,
            canStart: false,
            autoStartDefault: false
          };
        }
      }
    };
    for (const name of NOTEBOOK_FACTORIES) {
      app.docRegistry.addWidgetExtension(name, extension);
    }
  }
};
