import { _electron as electron, test, expect } from '@playwright/test';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

test('album creation persists and floating viewer shows original-derived detail without upscaling', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'memory-lane-detail-'));
  const library = join(root, 'library');
  await mkdir(library);
  const source = join(root, 'Detail Photo.jpg');
  execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
    '-c',
    "from PIL import Image,ImageDraw; import sys; im=Image.new('RGB',(3000,2000),'#eedfcb'); d=ImageDraw.Draw(im); [d.line((x,0,x,2000),fill='#641f36',width=2) for x in range(0,3000,20)]; im.save(sys.argv[1],quality=98)",
    source,
  ]);
  const env = { ...process.env, THING_TEST_DATA: join(root, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const binary = process.env.THING_PACKAGED_BINARY;
  const launch = () =>
    electron.launch({
      executablePath: binary,
      args: binary ? [`--user-data-dir=${env.THING_TEST_DATA}`] : [resolve('.')],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((s) => s.phase)), {
        timeout: 45000,
      })
      .toBe('ready');
    await app.evaluate(
      ({ dialog }, selection) => {
        let count = 0;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: count++ === 0 ? [selection.library] : [selection.source],
        });
      },
      { library, source },
    );
    await page.getByRole('button', { name: 'Bring your photos home' }).click();
    await expect(page.locator('.photo-card-open')).toHaveCount(1, { timeout: 30000 });
    await expect(page.locator('.photo-caption strong')).toHaveCSS('font-family', /Athiti/);
    await page.locator('.photo-card-open').click();
    const image = page.locator('.zoom-image img');
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth), { timeout: 30000 })
      .toBe(3000);
    await expect(image).toHaveAttribute('src', /\/display$/);
    await expect(page.locator('.image-quality-note')).toHaveCount(0);
    await page.getByRole('button', { name: '100% Detail' }).click();
    expect(
      await image.evaluate((node: HTMLImageElement) =>
        Math.abs(node.getBoundingClientRect().width * devicePixelRatio - node.naturalWidth),
      ),
    ).toBeLessThan(2);
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'memory-lane-sharp-viewer.png'),
      });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Trips & albums', exact: true }).click();
    await page.getByLabel('Collection type').selectOption('album');
    await expect(page.getByLabel('Start date')).toHaveCount(0);
    await page.getByLabel('New album name').fill('Family Names');
    await page.getByRole('button', { name: 'Create album', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Family Names', exact: true })).toBeVisible();
    const album = await page.evaluate(() =>
      window.thingSorted
        .catalog('trips', {})
        .then((rows) => rows.find((r) => r.title === 'Family Names')!),
    );
    expect(album.kind).toBe('album');
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await page.locator('.photo-select input').check();
    await page
      .getByLabel('Move selected photos to')
      .selectOption({ label: 'Family Names (Album)' });
    await page.getByRole('button', { name: 'Move selected', exact: true }).click();
    await expect(page.locator('.selection-toolbar')).toHaveCount(0);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((s) => s.phase)), {
        timeout: 45000,
      })
      .toBe('ready');
    await page.getByRole('button', { name: 'Trips & albums', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Family Names' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit album', exact: true }).click();
    await expect(page.getByLabel('Collection type')).toHaveValue('album');
    expect(
      await page.evaluate(() =>
        window.thingSorted.catalog('trips', {}).then((rows) => rows[0]?.count),
      ),
    ).toBe(1);
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'memory-lane-album-editor.png'),
      });
  } finally {
    await app.close();
  }
});
