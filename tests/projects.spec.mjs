// Milestone 3 checks: projects are folders with a bargueno.yml, and a
// project survives a zip round trip (the Working Copy sync path).
import fs from 'node:fs';

import { expect, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { exec, openApp } from './helpers.mjs';

const contents = {
  read: (page, path, format = 'text') =>
    page.evaluate(
      async ([path, format]) =>
        (await window.jupyterapp.serviceManager.contents.get(path, { content: true, format, type: 'file' }))
          .content,
      [path, format]
    ),
  write: (page, path, content) =>
    page.evaluate(
      ([path, content]) =>
        window.jupyterapp.serviceManager.contents.save(path, { type: 'file', format: 'text', content }),
      [path, content]
    ),
  exists: (page, path) =>
    page.evaluate(
      (path) => window.jupyterapp.serviceManager.contents.get(path, { content: false }).then(() => true, () => false),
      path
    ),
};

/** Run the import command with a zip built here, as if the user picked it. */
async function importZip(page, files, name, args = {}) {
  const zip = Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
  const chooser = page.waitForEvent('filechooser');
  const done = exec(page, 'bargueno:import-project', args);
  await (await chooser).setFiles({ name, mimeType: 'application/zip', buffer: zip });
  return done;
}

async function exportZip(page, project) {
  const download = page.waitForEvent('download');
  const name = await exec(page, 'bargueno:export-project', { project });
  const file = await download;
  expect(file.suggestedFilename()).toBe(name);
  return unzipSync(new Uint8Array(fs.readFileSync(await file.path())));
}

test('status bar shows the project of the active document', async ({ page }) => {
  await openApp(page);
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  await expect(page.locator('.bq-ProjectStatus')).toHaveText('example');
});

test('bargueno.yml sets the default template, and edits apply at once', async ({ page }) => {
  await openApp(page);
  await contents.write(page, 'example/bargueno.yml', 'compute: false\ntemplate: report\n');
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  await exec(page, 'bargueno:preview');
  const problems = page.locator('.bq-Preview-problems');
  await expect(problems).toContainText('Template "report" is not available yet', { timeout: 60_000 });

  await contents.write(page, 'example/bargueno.yml', 'compute: false\ntemplate: article\n');
  await page.waitForTimeout(500);
  await exec(page, 'bargueno:refresh-preview');
  await expect(problems).toBeHidden({ timeout: 60_000 });
});

test('New Project creates a starter folder and opens it', async ({ page }) => {
  await openApp(page);
  expect(await exec(page, 'bargueno:new-project', { name: 'thesis' })).toBe('thesis');
  for (const file of ['bargueno.yml', 'paper.md', 'references.bib', '.gitignore']) {
    expect(await contents.exists(page, `thesis/${file}`), file).toBe(true);
  }
  await expect(page.locator('.jp-FileEditor .cm-content').first()).toContainText('Untitled');
  await expect(page.locator('.bq-ProjectStatus')).toHaveText('thesis');
});

test('export zips the project under its folder name, without _exports/', async ({ page }) => {
  await openApp(page);
  await contents.write(page, 'example/scratch.txt', 'hello');
  await page.evaluate(() => window.jupyterapp.serviceManager.contents.save('example/_exports', { type: 'directory' }));
  await contents.write(page, 'example/_exports/old.pdf', 'not really a pdf');

  const entries = await exportZip(page, 'example');
  const names = Object.keys(entries).sort();
  expect(names).toEqual(
    expect.arrayContaining([
      'example/bargueno.yml',
      'example/paper.md',
      'example/references.bib',
      'example/scratch.txt',
      'example/sketch.typ',
      'example/talk.ipynb',
    ])
  );
  expect(names.filter((n) => n.includes('_exports'))).toEqual([]);
  // Notebooks are written the way Jupyter writes them (indent 1), so git diffs stay small.
  const nb = strFromU8(entries['example/talk.ipynb']);
  expect(nb).toMatch(/^\{\n "cells": \[/);
  expect(JSON.parse(nb).cells.length).toBeGreaterThan(3);
});

test('import unpacks a zip into a new project and drops junk', async ({ page }) => {
  await openApp(page);
  const project = await importZip(
    page,
    {
      'my-paper/paper.md': '# From Working Copy\n',
      'my-paper/assets/fig.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'my-paper/.git/HEAD': 'ref: refs/heads/main\n',
      '__MACOSX/my-paper/._paper.md': 'junk',
      'my-paper/.DS_Store': 'junk',
    },
    'my-paper.zip'
  );
  expect(project).toBe('my-paper');
  expect(await contents.read(page, 'my-paper/paper.md')).toBe('# From Working Copy\n');
  expect(await contents.exists(page, 'my-paper/assets/fig.svg')).toBe(true);
  for (const junk of ['my-paper/.git', 'my-paper/.DS_Store', '__MACOSX']) {
    expect(await contents.exists(page, junk), junk).toBe(false);
  }
});

test('a zip without a top folder is named after the file', async ({ page }) => {
  await openApp(page);
  const project = await importZip(page, { 'notes.md': 'loose\n', 'b/c.md': 'nested\n' }, 'loose-notes.zip');
  expect(project).toBe('loose-notes');
  expect(await contents.read(page, 'loose-notes/b/c.md')).toBe('nested\n');
});

test('importing over an existing project asks before replacing it', async ({ page }) => {
  await openApp(page);
  await exec(page, 'docmanager:open', { path: 'example/paper.md', factory: 'Editor' });
  const done = importZip(page, { 'example/paper.md': '# Replaced\n' }, 'example.zip');
  const dialog = page.locator('.jp-Dialog');
  await expect(dialog).toContainText('Replace project?');
  await dialog.getByRole('button', { name: 'Replace' }).click();
  expect(await done).toBe('example');
  expect(await contents.read(page, 'example/paper.md')).toBe('# Replaced\n');
  // Old files are gone: the project mirrors the zip exactly.
  expect(await contents.exists(page, 'example/talk.ipynb')).toBe(false);
  // The editor showing the old file was closed rather than left stale.
  await expect(page.locator('.jp-FileEditor')).toHaveCount(0);
});

test('cancelling the replace leaves the project untouched', async ({ page }) => {
  await openApp(page);
  const before = await contents.read(page, 'example/paper.md');
  const done = importZip(page, { 'example/paper.md': '# Replaced\n' }, 'example.zip');
  await page.locator('.jp-Dialog').getByRole('button', { name: 'Cancel' }).click();
  expect(await done).toBeUndefined();
  expect(await contents.read(page, 'example/paper.md')).toBe(before);
});

test('a project survives an export → import round trip byte for byte', async ({ page }) => {
  await openApp(page);
  const exported = await exportZip(page, 'example');
  const zip = Buffer.from(zipSync(exported));

  const chooser = page.waitForEvent('filechooser');
  const done = exec(page, 'bargueno:import-project', { name: 'example-copy' });
  await (await chooser).setFiles({ name: 'example.zip', mimeType: 'application/zip', buffer: zip });
  expect(await done).toBe('example-copy');

  const again = await exportZip(page, 'example-copy');
  const strip = (entries, prefix) =>
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.slice(prefix.length), strFromU8(v)]));
  expect(strip(again, 'example-copy/')).toEqual(strip(exported, 'example/'));
});
