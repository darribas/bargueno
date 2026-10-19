import { expect } from '@playwright/test';

export async function openApp(page) {
  await page.goto('lab/index.html');
  await page.waitForFunction(() => window.jupyterapp?.started !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => window.jupyterapp.started);
  await page.evaluate(() => window.jupyterapp.restored);
  // Set by bargueno:projects once the example project is in storage.
  await page.waitForSelector('body[data-bargueno-ready]', { state: 'attached', timeout: 30_000 });
}

export const exec = (page, id, args = {}) =>
  page.evaluate(([id, args]) => window.jupyterapp.commands.execute(id, args), [id, args]);

/** Wait until this page's service worker controls it, so reloads can go offline. */
export async function waitForServiceWorker(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
}

// The bargueno:kernel-policy plugin stops JupyterLab asking for a kernel
// when none exists; the dialog used to appear on every notebook.
export async function expectNoKernelDialog(page) {
  await page.waitForTimeout(1500);
  await expect(page.locator('.jp-Dialog')).toHaveCount(0);
}
