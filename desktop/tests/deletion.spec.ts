import { _electron as electron, test, expect } from '@playwright/test';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('marking a pair similar permanently deletes only the lower-quality managed copy', async () => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), 'memory-delete-'));
  execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
    resolve('../backend/tests/create_deletion_fixture.py'),
    root,
  ]);
  const fixture = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8'));
  const before = await readFile(join(root, 'blurred.png'));
  const profile = join(root, 'profile');
  const env = { ...process.env, THING_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const binary = process.env.THING_PACKAGED_BINARY;
  const launch = () =>
    electron.launch({
      executablePath: binary,
      args: binary ? [`--user-data-dir=${profile}`] : [resolve('.')],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole('status')).toHaveText('Health OK', { timeout: 45000 });
    await page.getByRole('button', { name: 'Duplicates', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark As Similar & Delete One' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark As Similar & Delete One' }).click();
    await expect(page.getByText(/Deleted Imported Copy: blurred.png/)).toBeVisible();
    expect(
      (await page.evaluate(() => window.thingSorted.catalog('query', {}))).photos.map((p) => p.id),
    ).toEqual([fixture.high]);
    await expect(access(fixture.lowPath)).rejects.toThrow();
    expect(await readFile(join(root, 'blurred.png'))).toEqual(before);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((s) => s.phase)), {
        timeout: 45000,
      })
      .toBe('ready');
    expect((await page.evaluate(() => window.thingSorted.catalog('query', {}))).total).toBe(1);
  } finally {
    await app.close();
  }
});
