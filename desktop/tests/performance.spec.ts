import { _electron as electron, test, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('5000 photos use a bounded gallery and a capped, keyboard-accessible orbit', async () => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(join(tmpdir(), 'thing-5000-'));
  execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
    resolve('../backend/tests/seed_large_library.py'),
    profile,
  ]);
  const env = { ...process.env, THING_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.THING_PACKAGED_BINARY;
  const app = await electron.launch({
    executablePath: packaged,
    args: packaged ? [`--user-data-dir=${profile}`] : [resolve('.')],
    env,
  });
  try {
    const page = await app.firstWindow();
    const failedImages: number[] = [];
    page.on('response', (response) => {
      if (response.url().startsWith('thing://app/photos/') && response.status() !== 200)
        failedImages.push(response.status());
    });
    await expect(page.getByRole('status')).toHaveText('HEALTH OK', { timeout: 45_000 });
    const started = Date.now();
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await expect(page.locator('.library-subtitle')).toContainText('5,000 photos');
    await expect(page.locator('.photo-card-open').first()).toBeVisible();
    const firstRenderMs = Date.now() - started;
    const initialCards = await page.locator('.photo-card').count();
    expect(initialCards).toBeLessThan(60);
    await page.locator('.virtual-scroller').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(page.locator('.photo-card-open').last()).toBeVisible();
    expect(await page.locator('.photo-card').count()).toBeLessThan(60);
    const frames = await page.evaluate(async () => {
      const element = document.querySelector('.virtual-scroller')!;
      const samples: number[] = [];
      let previous = performance.now();
      for (let index = 0; index < 120; index++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const now = performance.now();
        samples.push(now - previous);
        previous = now;
        element.scrollTop -= 30;
      }
      return samples.sort((a, b) => a - b);
    });
    await page.getByRole('button', { name: 'Photo orbit', exact: true }).click();
    await expect(page.locator('.orbit-photo')).toHaveCount(72);
    await expect(page.locator('.orbit-count')).toHaveText('5,000');
    const loaded = await page.evaluate(async () =>
      Promise.all(
        [...document.querySelectorAll('.orbit-photo image')].map(
          (node) =>
            new Promise<boolean>((resolve) => {
              const image = new Image();
              image.onload = () => resolve(image.naturalWidth > 0);
              image.onerror = () => resolve(false);
              image.src = node.getAttribute('href')!;
            }),
        ),
      ),
    );
    expect(loaded).toHaveLength(72);
    expect(loaded.every(Boolean)).toBe(true);
    expect(failedImages).toEqual([]);
    await page.locator('.orbit-photo').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.photo-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.orbit-photo').first()).toBeFocused();
    if (process.env.THING_SCREENSHOT_DIR) {
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-5000-orbit.png'),
        animations: 'disabled',
        fullPage: true,
      });
      await writeFile(
        join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-performance.json'),
        JSON.stringify(
          {
            photos: 5000,
            initialCards,
            orbitNodes: 72,
            firstRenderMs,
            medianFrameMs: frames[60],
            p95FrameMs: frames[114],
            note: 'Synthetic local benchmark on the development PC; not a clean-machine or minimum-hardware guarantee.',
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await app.close();
  }
});
