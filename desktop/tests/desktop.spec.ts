import { _electron as electron, test, expect } from '@playwright/test';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('native import, secure gallery, themes, preview, duplicates and restart persistence', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'thing-sorted-m2-'));
  const sources = join(root, 'source photos');
  const library = join(root, 'chosen library');
  await mkdir(library);
  execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
    resolve('../backend/tests/create_desktop_fixtures.py'),
    sources,
  ]);
  const files = (await readdir(sources)).sort().map((name) => join(sources, name));
  const hashes = await Promise.all(
    files.map(async (file) =>
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    ),
  );
  const env = { ...process.env, THING_TEST_DATA: join(root, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({ args: [resolve('.')], env });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(
      page.getByRole('heading', { name: 'Welcome to your little universe.' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('HEALTH OK', { timeout: 30_000 });
    expect(
      await page.locator('.ring-outer').evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('orbit-turn');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page.locator('.ring-outer').evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-m2-home.png'),
        fullPage: true,
        animations: 'disabled',
      });
    const secure = await app.evaluate(({ BrowserWindow }) => {
      const options = BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences();
      return {
        isolated: options.contextIsolation,
        sandbox: options.sandbox,
        node: options.nodeIntegration,
        web: options.webSecurity,
      };
    });
    expect(secure).toEqual({ isolated: true, sandbox: true, node: false, web: true });
    expect(await page.evaluate(() => Object.keys(window.thingSorted).sort())).toEqual([
      'ai',
      'archive',
      'cancelImport',
      'catalog',
      'copyDiagnostics',
      'importPhotos',
      'latestImport',
      'photos',
      'retry',
      'retryImport',
      'status',
      'watch',
    ]);
    expect(
      await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).require),
    ).toBe('undefined');
    expect(
      await page.evaluate(async () => {
        try {
          await fetch('https://example.com');
          return 'allowed';
        } catch {
          return 'blocked';
        }
      }),
    ).toBe('blocked');
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    expect(page.url()).toBe('thing://app/index.html');
    // Stub only the OS picker answer; exercise the real IPC, streams, API and decoders.
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
    await expect(page.locator('.photo-card')).toHaveCount(5);
    await expect(page.locator('.import-heading')).toContainText(
      '5 added · 1 duplicates · 1 rejected',
    );
    await expect
      .poll(async () =>
        page
          .locator('.photo-image img')
          .evaluateAll((images) =>
            images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
    await page.getByLabel('Animated moments').uncheck();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open preferences', exact: true })).toBeFocused();
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-m2-dark.png'),
        fullPage: true,
      });
    await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
    await page.getByLabel('Appearance').selectOption('light');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-m2-light.png'),
        fullPage: true,
      });
    await page.locator('.photo-card-open').first().click();
    await expect(page.locator('.photo-dialog')).toBeVisible();
    const first = await page.locator('.preview-heading strong').textContent();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.preview-heading strong')).not.toHaveText(first!);
    await page.keyboard.press('Escape');
    await expect(page.locator('.photo-dialog')).not.toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(820, 640));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await app.close();
    app = await electron.launch({ args: [resolve('.')], env });
    page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((value) => value.phase)), {
        timeout: 30_000,
      })
      .toBe('ready');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await expect(page.locator('.photo-card')).toHaveCount(5);
    const after = await Promise.all(
      files.map(async (file) =>
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      ),
    );
    expect(after).toEqual(hashes);
  } finally {
    await app.close();
  }
});
