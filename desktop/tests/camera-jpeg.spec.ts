import { _electron as electron, test, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('camera MPO JPEG imports and opens without changing original bytes', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'memory-camera-jpeg-'));
  const library = join(root, 'library');
  await mkdir(library);
  const source = process.env.MEMORY_JPEG_TEST_SOURCE ?? join(root, 'camera.JPG');
  if (!process.env.MEMORY_JPEG_TEST_SOURCE) {
    execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
      '-c',
      "from PIL import Image; import sys; a=Image.new('RGB',(120,80),'red'); b=Image.new('RGB',(60,40),'blue'); a.save(sys.argv[1],format='MPO',save_all=True,append_images=[b]); a.close(); b.close()",
      source,
    ]);
  }
  const hash = async (path: string) =>
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  const before = await hash(source);
  const profile = join(root, 'profile');
  const env = { ...process.env, THING_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.THING_PACKAGED_BINARY,
    args: process.env.THING_PACKAGED_BINARY ? [`--user-data-dir=${profile}`] : [resolve('.')],
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((s) => s.phase)), {
        timeout: 30_000,
      })
      .toBe('ready');
    await app.evaluate(
      ({ dialog }, paths) => {
        let step = 0;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [step++ === 0 ? paths.library : paths.source],
        });
        dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      },
      { library, source },
    );
    await page.evaluate(() => window.thingSorted.importPhotos());
    await expect
      .poll(
        () => page.evaluate(() => window.thingSorted.catalog('query', {}).then((v) => v.total)),
        { timeout: 45_000 },
      )
      .toBe(1);
    const photo = (await page.evaluate(() => window.thingSorted.catalog('query', {}))).photos[0]!;
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await page.locator('.photo-card-open').first().click();
    const display = page.locator('.zoom-image img');
    await expect
      .poll(() => display.evaluate((node: HTMLImageElement) => node.naturalWidth), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    await expect(display).toHaveAttribute('src', /\/display$/);
    expect(await display.evaluate((node: HTMLImageElement) => node.naturalHeight)).toBeGreaterThan(
      0,
    );
    const files = await readdir(library, { recursive: true });
    const copy = files.find((f) => f.endsWith(photo.id + '.jpg'));
    expect(copy).toBeTruthy();
    expect(await hash(join(library, copy!))).toBe(before);
    expect(await hash(source)).toBe(before);
  } finally {
    await app.close();
  }
});
