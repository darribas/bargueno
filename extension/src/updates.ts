import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { Dialog, ICommandPalette, Notification, showDialog } from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { Widget } from '@lumino/widgets';

const ABOUT = 'bargueno:about';

/**
 * SPEC: a new version installs in the background, then the app says so and
 * offers a reload. The service worker takes over straight away, so this
 * page keeps working on the old code until the user reloads.
 *
 * Also adds "Bargueño: About", which says exactly which build is running:
 * the first thing to check when something behaves differently on a device.
 */
export const updatesPlugin: JupyterFrontEndPlugin<void> = {
  id: 'bargueno:updates',
  description: 'Update notice and the About dialog.',
  autoStart: true,
  optional: [ICommandPalette],
  activate: (app: JupyterFrontEnd, palette: ICommandPalette | null) => {
    const sw = navigator.serviceWorker;
    // No controller yet means this is the first install, not an update.
    if (sw?.controller) {
      sw.addEventListener(
        'controllerchange',
        () => {
          document.body.dataset.barguenoUpdate = 'ready';
          Notification.info('A new version of Bargueño is ready. Your files are not affected.', {
            autoClose: false,
            actions: [{ label: 'Reload', callback: () => location.reload() }]
          });
        },
        { once: true }
      );
    }

    app.commands.addCommand(ABOUT, {
      label: 'About Bargueño',
      execute: async () => {
        const info = await aboutInfo();
        const body = new Widget({ node: document.createElement('dl') });
        body.addClass('bq-About');
        for (const [key, value] of Object.entries(info)) {
          const dt = document.createElement('dt');
          dt.textContent = key;
          const dd = document.createElement('dd');
          dd.textContent = value;
          body.node.append(dt, dd);
        }
        await showDialog({ title: 'Bargueño', body, buttons: [Dialog.okButton()] });
        return info;
      }
    });
    palette?.addItem({ command: ABOUT, category: 'Bargueño' });
  }
};

export async function aboutInfo(): Promise<Record<string, string>> {
  const info: Record<string, string> = {};
  try {
    const response = await fetch(URLExt.join(PageConfig.getBaseUrl(), 'bargueno/version.json'), {
      cache: 'no-store'
    });
    const build = await response.json();
    info['App build'] = `${build.commit} (${build.built})`;
  } catch {
    info['App build'] = 'unknown';
  }
  info['Offline cache'] = await workerVersion();
  info['Storage'] = (await navigator.storage?.persisted?.().catch(() => false))
    ? 'persistent'
    : 'may be cleared by the browser';
  info['Browser'] = navigator.userAgent;
  return info;
}

function workerVersion(): Promise<string> {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) {
    return Promise.resolve('not installed yet');
  }
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve('no answer'), 2000);
    navigator.serviceWorker.addEventListener('message', function onMessage(event) {
      if (event.data?.type === 'bargueno:version') {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve(event.data.version);
      }
    });
    controller.postMessage('bargueno:version');
  });
}
