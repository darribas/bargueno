// Milestone 2 checks: MyST manuscripts and raw .typ files typeset through
// myst-to-typst and typst.ts into an SVG preview and a PDF, offline.
import { expect, test } from '@playwright/test';

import { exec, openApp, waitForServiceWorker } from './helpers.mjs';

const preview = (page) => page.locator('.bq-Preview');

async function openPreview(page, path) {
  await exec(page, 'docmanager:open', { path, factory: 'Editor' });
  await expect(page.locator('.jp-FileEditor .cm-content').first()).toBeVisible();
  await exec(page, 'bargueno:preview');
  await expect(preview(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
}

const readFile = (page, path, format = 'text') =>
  page.evaluate(
    async ([path, format]) =>
      (await window.jupyterapp.serviceManager.contents.get(path, { content: true, format })).content,
    [path, format]
  );

test('MyST manuscript previews as typeset pages', async ({ page }) => {
  await openApp(page);
  await openPreview(page, 'example/paper.md');
  const svg = preview(page).locator('.bq-Preview-pages > svg');
  await expect(svg).toHaveCount(1);
  expect(await svg.locator('.typst-page').count()).toBeGreaterThanOrEqual(1);
  await expect(preview(page).locator('.bq-Preview-problems')).toBeHidden();
  await expect(preview(page).locator('.bq-Preview-status')).toContainText('Updated');
  // The preview opens beside the editor, not over it.
  await expect(page.locator('.jp-FileEditor')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/preview.png' });
});

test('editor toolbar has a Preview button', async ({ page }) => {
  await openApp(page);
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  await page.locator('.jp-Toolbar .jp-ToolbarButtonComponent-label', { hasText: 'Preview' }).click();
  await expect(preview(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
});

test('saving the source refreshes the preview', async ({ page }) => {
  await openApp(page);
  await openPreview(page, 'example/paper.md');
  const pages = preview(page).locator('.typst-page');
  const before = await pages.count();
  // Append enough text to push the document onto another page, then save.
  await page.evaluate(() => {
    const widget = window.jupyterapp.shell.widgets('main').find((w) => w.context?.path === 'example/paper.md');
    const filler = '\n\n' + Array(40).fill('A paragraph of filler text that keeps going for a while.').join(' ');
    widget.context.model.sharedModel.setSource(widget.context.model.toString() + filler.repeat(8));
    return widget.context.save();
  });
  await expect.poll(() => pages.count(), { timeout: 60_000 }).toBeGreaterThan(before);
});

test('Typst errors are reported in the pane', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() =>
    window.jupyterapp.serviceManager.contents.save('broken.typ', {
      type: 'file',
      format: 'text',
      content: '= Fine\n#unknown-function()\n',
    })
  );
  await exec(page, 'docmanager:open', { path: 'broken.typ', factory: 'Editor' });
  await expect(page.locator('.jp-FileEditor .cm-content').first()).toBeVisible();
  await exec(page, 'bargueno:preview');
  await expect(preview(page)).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
  await expect(preview(page).locator('.bq-Preview-problems')).toContainText('unknown variable');
});

test('raw .typ file previews and exports to PDF', async ({ page }) => {
  await openApp(page);
  await openPreview(page, 'example/sketch.typ');
  const download = page.waitForEvent('download');
  const path = await exec(page, 'bargueno:export-pdf');
  expect(path).toBe('example/_exports/sketch.pdf');
  expect((await download).suggestedFilename()).toBe('sketch.pdf');
  expect(await readFile(page, path, 'base64')).toMatch(/^JVBERi0/); // "%PDF-"
});

test('MyST manuscript exports to PDF and standalone Typst', async ({ page }) => {
  await openApp(page);
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  await expect(page.locator('.jp-FileEditor .cm-content').first()).toBeVisible();

  const pdfPath = await exec(page, 'bargueno:export-pdf');
  expect(pdfPath).toBe('example/_exports/paper.pdf');
  expect(await readFile(page, pdfPath, 'base64')).toMatch(/^JVBERi0/);

  const typPath = await exec(page, 'bargueno:export-typst');
  expect(typPath).toBe('example/_exports/paper.typ');
  const typ = await readFile(page, typPath);
  expect(typ).toContain('#let article(');
  expect(typ).toContain('#show: article.with(title: "A Portable Writing Cabinet"');
  expect(typ).not.toContain('#import "/_bargueno');
});

test('preview works offline after the first visit', async ({ page, context }) => {
  await openApp(page);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await openApp(page);
  await openPreview(page, 'example/paper.md');
  await expect(preview(page).locator('.typst-page').first()).toBeAttached();
});
