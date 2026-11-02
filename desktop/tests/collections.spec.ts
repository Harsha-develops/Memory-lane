import { _electron as electron, test, expect } from '@playwright/test';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

test('trips, bulk assignment, orbit, metadata, similarity, privacy, and persistence', async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), 'thing-collections-'));
  const source = join(root, 'source');
  const library = join(root, 'library');
  await mkdir(library);
  execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
    resolve('../backend/tests/create_desktop_fixtures.py'),
    source,
  ]);
  const env = { ...process.env, THING_TEST_DATA: join(root, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.THING_PACKAGED_BINARY;
  if (packaged) env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  const launch = () =>
    electron.launch({
      executablePath: packaged,
      args: packaged ? [`--user-data-dir=${join(root, 'profile')}`] : [resolve('.')],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('status')).toHaveText('Health OK', { timeout: 45_000 });
    // Fixture filenames are discovered by the test harness, never passed by a renderer path.
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(source)).map((name) => join(source, name));
    await app.evaluate(
      ({ dialog }, selection) => {
        let count = 0;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: count++ === 0 ? [selection.library] : selection.files,
        });
      },
      { library, files },
    );
    await page.getByRole('button', { name: 'Bring your photos home' }).click();
    await expect(page.getByRole('heading', { name: 'Your import is complete.' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('.photo-card-open')).toHaveCount(5);
    await page.getByRole('button', { name: 'Trips & albums', exact: true }).click();
    await page.getByLabel('New trip name').fill('Maroon weekend');
    await page.getByLabel('Start date', { exact: true }).fill('2024-01-01');
    await page.getByLabel('End date', { exact: true }).fill('2026-12-31');
    await page.getByRole('button', { name: 'Create trip', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Maroon weekend' })).toBeVisible();
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await page.locator('.photo-select input').first().check();
    await page.locator('.photo-select input').nth(1).check();
    await page.getByLabel('Move selected photos to').selectOption({ label: 'Maroon weekend' });
    await page.getByRole('button', { name: 'Move selected', exact: true }).click();
    await expect(page.locator('.selection-toolbar')).toHaveCount(0);
    await page.getByLabel('Filter by trip').selectOption({ label: 'Maroon weekend' });
    await expect(page.locator('.photo-card-open')).toHaveCount(2);
    await page.locator('.photo-card-open').first().click();
    await expect(page.locator('.photo-information')).toContainText('Source file modified time');
    await page.getByRole('button', { name: 'Use as trip cover' }).click();
    await expect(page.locator('.photo-information')).toContainText('Trip cover updated.');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Photo orbit', exact: true }).click();
    await expect(page.locator('.orbit-photo')).toHaveCount(5);
    await page.locator('.orbit-photo').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.photo-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page
        .locator('.memory-ring')
        .first()
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-m6-orbit.png'),
        animations: 'disabled',
        fullPage: true,
      });
    await page.getByRole('button', { name: 'Duplicates', exact: true }).click();
    await page.getByRole('button', { name: 'Find similar photos' }).click();
    await expect(page.getByRole('button', { name: 'Find similar photos' })).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
    await page.getByLabel('Show photo locations').check();
    await expect(page.getByLabel('Show photo locations')).toBeChecked();
    await page.getByLabel('Keep location metadata').uncheck();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.catalog('privacy', {})))
      .toEqual({ showGps: true, storeGps: false });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Trips & albums', exact: true }).click();
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-m6-trips.png'),
        animations: 'disabled',
        fullPage: true,
      });
    expect(errors).toEqual([]);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((value) => value.phase)), {
        timeout: 45_000,
      })
      .toBe('ready');
    await page.getByRole('button', { name: 'Trips & albums', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Maroon weekend' })).toBeVisible();
    await expect(page.locator('.trip-cover')).toContainText('2 photos');
    await expect(page.getByRole('button', { name: 'Trips & albums', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('button', { name: 'Open Maroon weekend', exact: true }).click();
    await expect(page.locator('.photo-card-open')).toHaveCount(2);
    expect(await page.evaluate(() => window.thingSorted.catalog('privacy', {}))).toEqual({
      showGps: true,
      storeGps: false,
    });
    expect(
      await page.evaluate(async () => {
        try {
          await window.thingSorted.catalog('query', { search: 'x', ...{ path: 'C:\\private' } });
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
  } finally {
    await app.close();
  }
});
