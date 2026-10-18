// Milestone 1 checks: the three extensions load in JupyterLite, a deck
// renders with no kernel, and the app reopens offline.
import { expect, test } from '@playwright/test';

// Known gap: JupyterLab asks for a kernel whenever a notebook opens and no
// kernel spec exists. The deck renders behind the dialog; "No Kernel" dismisses
// it. A Bargueño plugin should set kernelPreference.shouldStart = false while
// compute is off, after which this helper (and its callers) can go.
async function dismissKernelDialog(page) {
  const dialog = page.locator('.jp-Dialog');
  await expect(dialog.getByText('Select Kernel').first()).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'No Kernel' }).click();
  await expect(dialog).toHaveCount(0);
}

async function openApp(page) {
  await page.goto('lab/index.html');
  await page.waitForFunction(() => window.jupyterapp?.started !== undefined, null, { timeout: 60_000 });
  await page.evaluate(() => window.jupyterapp.started);
  await page.evaluate(() => window.jupyterapp.restored);
}

const exec = (page, id, args = {}) =>
  page.evaluate(([id, args]) => window.jupyterapp.commands.execute(id, args).then(() => true), [id, args]);

test('extensions load and no kernel is available', async ({ page }) => {
  await openApp(page);
  const info = await page.evaluate(async () => {
    const app = window.jupyterapp;
    const specs = app.serviceManager.kernelspecs;
    await specs.ready;
    return {
      plugins: app.listPlugins(),
      kernels: Object.keys(specs.specs?.kernelspecs ?? {}),
      title: document.title,
    };
  });
  expect(info.plugins).toContain('jupyterlab-myst-revealjs:plugin');
  for (const prefix of ['@axlair/jupyterlab_vim', 'jupyterlab-myst:']) {
    expect(info.plugins.some((id) => id.startsWith(prefix)), prefix).toBe(true);
  }
  expect(info.kernels).toEqual([]);
  expect(info.title).toContain('Bargueño');
});

test('markdown opens in a vim editor', async ({ page }) => {
  await openApp(page);
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  const editor = page.locator('.jp-FileEditor .cm-content').first();
  await expect(editor).toContainText('portable writing cabinet', { ignoreCase: true });
  await editor.click();
  // Normal mode: "x" deletes a character instead of typing one.
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await page.keyboard.press('g');
  await page.keyboard.press('x');
  await expect(editor).toContainText('--\ntitle', { useInnerText: true });
  await expect(page.locator('.jp-FileEditor .cm-vimMode, .jp-FileEditor .cm-fat-cursor').first()).toBeAttached();
});

test('notebook deck renders as reveal.js slides with no kernel', async ({ page }) => {
  await openApp(page);
  await exec(page, 'slideshow:open', { path: 'example/talk.ipynb' });
  await dismissKernelDialog(page);
  const slides = page.locator('.reveal .slides > section');
  await expect(slides.first()).toBeVisible({ timeout: 30_000 });
  expect(await slides.count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.reveal').getByText('Directives render through jupyterlab-myst')).toBeAttached();
  await expect(page.locator('.reveal .katex').first()).toBeAttached();
  await expect(page.locator('.reveal').getByText('stored output, no kernel needed').first()).toBeAttached();
  // Arrow keys drive reveal.js, so the deck is live rather than a static render.
  await page.locator('.reveal').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.reveal .slides > section.present .heading-text', { hasText: 'MyST works in slides' })).toBeVisible();
  await page.waitForTimeout(1000); // let the slide transition finish
  await page.screenshot({ path: 'test-results/deck.png' });
});

test('app and deck open offline after first visit', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
    return reg.active.state;
  });
  await context.setOffline(true);
  await openApp(page);
  await exec(page, 'slideshow:open', { path: 'example/talk.ipynb' });
  await dismissKernelDialog(page);
  await expect(page.locator('.reveal .slides > section').first()).toBeVisible({ timeout: 30_000 });
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  await expect(page.locator('.jp-FileEditor .cm-content').first()).toContainText('Introduction');
});
