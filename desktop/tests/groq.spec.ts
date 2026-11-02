import { _electron as electron, test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const loadModule = createRequire(resolve('tests/groq.spec.ts'));
const { validateConfiguration } = loadModule('../dist-electron/electron/ai-provider.js');
const { visionBody, referenceBatches } = loadModule('../dist-electron/electron/vision.js');

test('Groq base URLs normalize correctly and reference batches obey the three-image limit', () => {
  const config = validateConfiguration({
    endpoint: 'https://api.groq.com/openai/v1/',
    model: 'qwen/qwen3.8-27b',
    protocol: 'chat',
  });
  expect(config.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
  expect(validateConfiguration({ ...config, endpoint: config.endpoint + '/' }).endpoint).toBe(
    config.endpoint,
  );
  expect(() => validateConfiguration({ ...config, protocol: 'responses' })).toThrow('format');
  const refs = Array.from({ length: 8 }, (_, i) => ({
    label: `person ${i + 1}`,
    image: 'data:image/jpeg;base64,REFERENCE',
  }));
  const batches = referenceBatches(config, refs);
  expect(batches).toHaveLength(4);
  expect(batches.flat()).toEqual(refs);
  for (const batch of batches) {
    const body = visionBody(config, 'data:image/jpeg;base64,TARGET', batch, ['food']);
    expect(
      body.messages[1].content.filter((c: { type: string }) => c.type === 'image_url'),
    ).toHaveLength(3);
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.reasoning_effort).toBe('none');
  }
});

test('Groq preset reuses only its own saved key, rejects text-only vision, and tests the corrected route', async () => {
  test.setTimeout(90_000);
  const profile = await mkdtemp(join(tmpdir(), 'thing-groq-'));
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
      .poll(() => page.evaluate(() => window.thingSorted.status().then((v) => v.phase)), {
        timeout: 30_000,
      })
      .toBe('ready');
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      const https = process.getBuiltinModule('https');
      const { EventEmitter } = process.getBuiltinModule('events');
      const state = {
        calls: [] as { endpoint: string; keyCorrect: boolean; body: unknown }[],
        code: 200,
      };
      (globalThis as unknown as { groqTest: typeof state }).groqTest = state;
      https.request = (
        endpoint: string,
        options: { headers: { Authorization: string } },
        callback: (res: unknown) => void,
      ) => {
        const req = new EventEmitter();
        req.destroy = () => req.emit('close');
        req.end = (data: string) => {
          state.calls.push({
            endpoint,
            keyCorrect: options.headers.Authorization === 'Bearer dummy-user-groq-key',
            body: JSON.parse(data),
          });
          queueMicrotask(() => {
            const res = new EventEmitter();
            res.statusCode = state.code;
            res.destroy = () => req.emit('close');
            callback(res);
            if (state.code === 200) {
              res.emit(
                'data',
                Buffer.from(JSON.stringify({ choices: [{ message: { content: '["objects"]' } }] })),
              );
              res.emit('end');
              req.emit('close');
            }
          });
        };
        return req;
      };
    });
    const saved = await page.evaluate(() =>
      window.thingSorted.ai('save', {
        endpoint: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-20b',
        protocol: 'chat',
        key: 'dummy-user-groq-key',
      }),
    );
    expect(saved.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    await expect(page.evaluate(() => window.thingSorted.ai('testVision', null))).rejects.toThrow(
      'text-only',
    );
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { groqTest: { calls: unknown[] } }).groqTest.calls.length,
      ),
    ).toBe(0);
    await page.getByRole('button', { name: /API key/ }).click();
    await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('openai/gpt-oss-20b');
    await page.getByRole('button', { name: 'Use Groq vision settings' }).click();
    await page.getByRole('button', { name: 'Save provider & key' }).click();
    await expect(page.getByText('Provider saved. No request has been sent.')).toBeVisible();
    await expect(page.getByLabel('Your API key', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Test vision connection (uses API credits)' }).click();
    await expect(
      page.getByText('Vision connection works. You can now classify photos.'),
    ).toBeVisible();
    const calls = await app.evaluate(
      () =>
        (
          globalThis as unknown as {
            groqTest: { calls: { endpoint: string; keyCorrect: boolean }[] };
          }
        ).groqTest.calls,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.keyCorrect).toBe(true);
    expect(calls[0]!.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    await expect(
      page.evaluate(() =>
        window.thingSorted.ai('save', {
          endpoint: 'https://different.example/v1',
          model: 'test',
          protocol: 'chat',
          key: '',
        }),
      ),
    ).rejects.toThrow();
    expect((await page.evaluate(() => window.thingSorted.ai('status', null))).endpoint).toBe(
      saved.endpoint,
    );
    await app.evaluate(() => {
      (globalThis as unknown as { groqTest: { code: number } }).groqTest.code = 404;
    });
    await page.getByRole('button', { name: 'Test vision connection (uses API credits)' }).click();
    await expect(page.locator('.ai-panel').getByRole('status')).toContainText(
      'endpoint or model not found (HTTP 404)',
    );
  } finally {
    await app.close();
  }
});
