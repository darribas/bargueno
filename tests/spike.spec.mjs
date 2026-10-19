// Milestone 1 checks: the three extensions load in JupyterLite, a deck
// renders with no kernel, and the app reopens offline.
import { expect, test } from '@playwright/test';

import { exec, expectNoKernelDialog, openApp, waitForServiceWorker } from './helpers.mjs';

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
  await expectNoKernelDialog(page);
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
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await openApp(page);
  await exec(page, 'slideshow:open', { path: 'example/talk.ipynb' });
  await expectNoKernelDialog(page);
  await expect(page.locator('.reveal .slides > section').first()).toBeVisible({ timeout: 30_000 });
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  await expect(page.locator('.jp-FileEditor .cm-content').first()).toContainText('Introduction');
});
