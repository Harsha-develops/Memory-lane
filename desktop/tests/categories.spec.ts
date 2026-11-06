import { _electron as electron, test, expect } from '@playwright/test';
import { mkdtemp, mkdir, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const loadModule = createRequire(resolve('tests/categories.spec.ts'));
const { visionBody, parseCategories } = loadModule('../dist-electron/electron/vision.js');
test('vision payloads separate target and references; unknown and invented person labels are rejected', () => {
  const config = {
    model: 'vision-model',
    protocol: 'chat',
    endpoint: 'https://provider.example/chat',
  };
  const body = visionBody(config, 'data:image/jpeg;base64,TARGET', [
    { label: 'person 1', image: 'data:image/jpeg;base64,REF' },
  ]);
  expect(
    body.messages[1].content.filter((c: { type: string }) => c.type === 'image_url'),
  ).toHaveLength(2);
  const response = visionBody(
    { ...config, protocol: 'responses' },
    'data:image/jpeg;base64,TARGET',
    [],
  );
  expect(response.store).toBe(false);
  expect(response.max_output_tokens).toBe(256);
  expect(response.input[0].content[1].detail).toBe('low');
  expect(parseCategories('["pottery"]', [], ['others'], true)).toEqual(['pottery']);
  expect(() => parseCategories('["person nine"]', [], ['others'], true)).toThrow();
  expect(() => parseCategories('["pottery","jewellery"]', [], ['others'], true)).toThrow();
  expect(response.input[0].content[1].type).toBe('input_image');
  expect(parseCategories('["food","sunlight","backlit"]', [])).toEqual([
    'food',
    'sunlight',
    'backlit',
  ]);
  expect(parseCategories('```json\n["portrait","person 1"]\n```', ['person 1'])).toEqual([
    'portrait',
    'person 1',
  ]);
  for (const reply of ['["person 2"]', '["doctor"]', '<script>bad</script>', '{"tags":["food"]}'])
    expect(() => parseCategories(reply, ['person 1'])).toThrow();
});

test('photo preview analysis, person references, review, category filters and restart persistence', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'thing-categories-'));
  const source = join(root, 'sources');
  const library = join(root, 'library');
  await mkdir(library);
  execFileSync(resolve('../backend/.venv/Scripts/python.exe'), [
    resolve('../backend/tests/create_desktop_fixtures.py'),
    source,
  ]);
  const names = await readdir(source);
  const photoPath = join(
    source,
    names.find((n) => n.toLowerCase().endsWith('.jpg'))!,
  );
  const digest = async () =>
    createHash('sha256')
      .update(await readFile(photoPath))
      .digest('hex');
  const before = await digest();
  const profile = join(root, 'profile');
  const env = { ...process.env, THING_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = {
    executablePath: process.env.THING_PACKAGED_BINARY,
    args: process.env.THING_PACKAGED_BINARY ? [`--user-data-dir=${profile}`] : [resolve('.')],
    env,
  };
  let app = await electron.launch(launch);
  try {
    let page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((v) => v.phase)), {
        timeout: 30_000,
      })
      .toBe('ready');
    await app.evaluate(
      ({ dialog }, paths) => {
        let count = 0;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: count++ === 0 ? [paths.library] : [paths.photoPath],
        });
        dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      },
      { photoPath, library },
    );
    await page.evaluate(() => window.thingSorted.importPhotos());
    await expect
      .poll(
        async () => (await page.evaluate(() => window.thingSorted.catalog('query', {}))).total,
        { timeout: 30_000 },
      )
      .toBe(1);
    await page.evaluate(() =>
      window.thingSorted.ai('save', {
        endpoint: 'https://provider.example/v1/chat/completions',
        model: 'test-vision',
        protocol: 'chat',
        key: 'dummy-private-vision-key',
      }),
    );
    await app.evaluate(() => {
      const https = process.getBuiltinModule('https');
      const { EventEmitter } = process.getBuiltinModule('events');
      const state = { calls: [] as unknown[] };
      (globalThis as unknown as { visionTest: typeof state }).visionTest = state;
      https.request = (_url: string, _options: unknown, callback: (res: unknown) => void) => {
        const req = new EventEmitter();
        req.destroy = () => req.emit('close');
        req.end = (data: string) => {
          state.calls.push(JSON.parse(data));
          queueMicrotask(() => {
            const res = new EventEmitter();
            res.statusCode = 200;
            res.destroy = () => req.emit('close');
            callback(res);
            res.emit(
              'data',
              Buffer.from(
                JSON.stringify({
                  choices: [
                    { message: { content: '["portrait","backlit","person 1","pottery"]' } },
                  ],
                }),
              ),
            );
            res.emit('end');
            req.emit('close');
          });
        };
        return req;
      };
    });
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await page.locator('.photo-card-open').first().click();
    await page.getByLabel('Person name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Name person & use reference' }).click();
    await expect(page.getByRole('button', { name: 'Save person name' })).toBeVisible();
    await page.getByRole('button', { name: 'AI categorize photo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Classify & Organise' })).toBeDisabled();
    await page.getByLabel('Name For Others', { exact: true }).fill('Other Moments');
    await page.getByRole('button', { name: 'Save Category Name' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.thingSorted.catalog('categoryNames', {}).then((v) => v.others)),
      )
      .toBe('Other Moments');
    await page.getByRole('checkbox', { name: /Also sort into my named people/ }).check();
    await page.getByRole('checkbox', { name: /Send uncategorised previews/ }).check();
    await page.getByRole('button', { name: 'Classify & Organise' }).click();
    await expect(page.getByText('Categorised', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Destination For/)).toHaveValue('person 1');
    await expect(page.getByRole('button', { name: 'Organised', exact: true })).toBeDisabled();
    const photo = (await page.evaluate(() => window.thingSorted.catalog('query', {}))).photos[0]!;
    expect(photo.tags).toEqual(['backlit', 'person 1', 'portrait', 'pottery']);
    expect(
      (await page.evaluate(() => window.thingSorted.catalog('categoryNames', {}))).pottery,
    ).toBe('Pottery'); // AI commits directly into matching albums.
    const payloads = await app.evaluate(
      () => (globalThis as unknown as { visionTest: { calls: unknown[] } }).visionTest.calls,
    );
    expect(payloads).toHaveLength(1);
    expect((payloads[0] as { max_tokens: number }).max_tokens).toBe(256);
    expect(
      (await page.evaluate(() => window.thingSorted.catalog('query', { uncategorized: true })))
        .total,
    ).toBe(0);
    expect(
      await page.evaluate(
        (id) =>
          window.thingSorted.ai('analyze', {
            id,
            consent: true,
            people: true,
            categories: ['portrait'],
          }),
        photo.id,
      ),
    ).toMatchObject({ alreadyCategorized: true });
    expect(
      await app.evaluate(
        () =>
          (globalThis as unknown as { visionTest: { calls: unknown[] } }).visionTest.calls.length,
      ),
    ).toBe(1);
    const payload = payloads[0] as { messages: { content: unknown }[] };
    const content = payload.messages[1]!.content as { type: string; image_url?: { url: string } }[];
    expect(content.filter((c) => c.type === 'image_url')).toHaveLength(2);
    for (const image of content.filter((c) => c.type === 'image_url')) {
      const bytes = Buffer.from(image.image_url!.url.split(',')[1]!, 'base64');
      expect(bytes.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
      expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
    }
    expect(JSON.stringify(payloads)).not.toContain(photo.name);
    expect(JSON.stringify(payloads)).not.toContain('Alex');
    await expect(page.getByRole('button', { name: 'Save reviewed categories' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /Categories for/ })).toHaveCount(0);
    expect(
      await page
        .locator('.category-review')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 2),
    ).toBe(true);
    await page.locator('.category-review').evaluate((node) => {
      node.scrollTop = 0;
    });
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-category-review.png'),
        animations: 'disabled',
      });
    await page.getByRole('button', { name: 'Close categorization' }).click();
    await page.getByRole('button', { name: 'Close photo preview' }).click();
    await expect(
      page.getByRole('combobox', { name: 'Filter by category' }).locator('option'),
    ).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Filter by category' }).selectOption('person 1');
    await expect(page.locator('.library-subtitle')).toContainText('1 photo');
    await page.getByRole('button', { name: 'Trips & albums', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open album Alex', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open album Alex', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open album Alex', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Filter by category' })).toHaveValue(
      'person 1',
    );
    await page.getByRole('button', { name: 'All photos', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Filter by category' })).toHaveValue('');
    expect(await digest()).toBe(before);
    await app.close();
    app = await electron.launch(launch);
    page = await app.firstWindow();
    await expect
      .poll(() => page.evaluate(() => window.thingSorted.status().then((v) => v.phase)), {
        timeout: 30_000,
      })
      .toBe('ready');
    expect(
      (await page.evaluate(() => window.thingSorted.catalog('query', { tag: 'person 1' }))).total,
    ).toBe(1);
    expect(await page.evaluate(() => window.thingSorted.catalog('people', {}))).toEqual([
      { id: photo.id, label: 'person 1' },
    ]);
  } finally {
    await app.close();
  }
});
