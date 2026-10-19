import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { IDisposable } from '@lumino/disposable';

/**
 * Notebook widget factories that ask for a kernel when a document opens.
 * `Slideshow` comes from jupyterlab-myst-revealjs.
 */
const NOTEBOOK_FACTORIES = ['Notebook', 'Slideshow'];

/**
 * Compute is off unless a kernel exists, so opening a notebook must not
 * start one or ask which one to start. Without this, JupyterLab shows a
 * "Select Kernel" dialog for every notebook in a kernel-less build.
 */
export const kernelPolicyPlugin: JupyterFrontEndPlugin<void> = {
  id: 'bargueno:kernel-policy',
  description: 'Open notebooks without starting or asking for a kernel.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    const specs = app.serviceManager.kernelspecs;
    const noKernels = () =>
      Object.keys(specs.specs?.kernelspecs ?? {}).length === 0;

    const extension: DocumentRegistry.WidgetExtension = {
      createNew: (_widget, context): IDisposable | void => {
        if (noKernels()) {
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
