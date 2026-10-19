// App-level checks: which build is running.
import { expect, test } from '@playwright/test';

import { exec, openApp, waitForServiceWorker } from './helpers.mjs';

test('About Bargueño reports the build and the offline cache version', async ({ page }) => {
  await openApp(page);
  await waitForServiceWorker(page);
  const done = exec(page, 'bargueno:about');
  const dialog = page.locator('.jp-Dialog');
  await expect(dialog).toContainText('App build');
  await dialog.getByRole('button', { name: 'Ok' }).click();
  const info = await done;
  expect(info['App build']).toMatch(/^[0-9a-f]{7,} \(\d{4}-\d{2}-\d{2} /);
  expect(info['Offline cache']).toMatch(/^[0-9a-f]{12}$/);
});
