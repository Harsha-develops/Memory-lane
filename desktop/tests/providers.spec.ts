import { _electron as electron, test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const load = createRequire(resolve('tests/providers.spec.ts'));
const { providerPresets } = load('../dist-electron/shared/providers.js');
const { validateConfiguration, makeBody } = load('../dist-electron/electron/ai-provider.js');
const { visionBody } = load('../dist-electron/electron/vision.js');

test('Gemini endpoint normalization and provider-specific token controls', () => {
  const gemini = providerPresets.find((p: { name: string }) => p.name === 'Gemini').configuration;
  for (const endpoint of [
    'https://generativelanguage.googleapis.com',
    'https://generativelanguage.googleapis.com/v1beta/',
    'https://generativelanguage.googleapis.com/v1beta/openai/',
    gemini.endpoint,
  ]) {
    expect(validateConfiguration({ ...gemini, endpoint }).endpoint).toBe(gemini.endpoint);
  }
  expect(() => validateConfiguration({ ...gemini, protocol: 'responses' })).toThrow('Gemini');
  expect(visionBody(gemini, 'image', []).reasoning_effort).toBe('minimal');
  expect(makeBody(gemini, 'tags', 'notes').max_tokens).toBe(128);
  expect(makeBody(gemini, 'caption', 'notes').max_tokens).toBe(256);
  expect(makeBody(gemini, 'album', 'notes').max_tokens).toBe(384);
  expect(makeBody(gemini, 'album', 'notes').reasoning_effort).toBe('minimal');
  const openai = providerPresets.find((p: { name: string }) => p.name === 'OpenAI').configuration;
  expect(visionBody(openai, 'image', []).reasoning_effort).toBeUndefined();
  expect(visionBody(openai, 'image', []).messages[1].content[1].image_url.detail).toBe('low');
  expect(
    makeBody({ ...gemini, model: 'custom-model' }, 'tags', 'notes').reasoning_effort,
  ).toBeUndefined();
});

test('Gemini and OpenAI presets use only the matching user key and send nothing until tested', async () => {
  test.setTimeout(90000);
  const profile = await mkdtemp(join(tmpdir(), 'memory-presets-'));
  const env = { ...process.env, THING_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const binary = process.env.THING_PACKAGED_BINARY;
  const app = await electron.launch({
    executablePath: binary,
    args: binary ? [`--user-data-dir=${profile}`] : [resolve('.')],
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('status')).toHaveText('Health OK', { timeout: 45000 });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      const https = process.getBuiltinModule('https');
      const { EventEmitter } = process.getBuiltinModule('events');
      const calls: { endpoint: string; correctKey: boolean; body: unknown }[] = [];
      (globalThis as unknown as { presetCalls: typeof calls }).presetCalls = calls;
      https.request = (
        endpoint: string,
        options: { headers: { Authorization: string } },
        callback: (res: unknown) => void,
      ) => {
        const req = new EventEmitter();
        req.destroy = () => req.emit('close');
        req.end = (data: string) => {
          const provider = endpoint.includes('googleapis.com') ? 'Gemini' : 'OpenAI';
          calls.push({
            endpoint,
            correctKey: options.headers.Authorization === `Bearer dummy-${provider}-key`,
            body: JSON.parse(data),
          });
          queueMicrotask(() => {
            const res = new EventEmitter();
            res.statusCode = 200;
            res.destroy = () => req.emit('close');
            callback(res);
            res.emit(
              'data',
              Buffer.from(JSON.stringify({ choices: [{ message: { content: '["objects"]' } }] })),
            );
            res.emit('end');
            req.emit('close');
          });
        };
        return req;
      };
    });
    await page.getByRole('button', { name: /API key/ }).click();
    let count = 0;
    for (const name of ['Gemini', 'OpenAI']) {
      await page.getByLabel('Your API key', { exact: true }).fill('dummy-wrong-provider-key');
      await page.getByRole('button', { name: `Use ${name} vision settings` }).click();
      await expect(page.getByLabel('Your API key', { exact: true })).toHaveValue('');
      await page.getByLabel('Your API key', { exact: true }).fill(`dummy-${name}-key`);
      await page.getByRole('button', { name: 'Save provider & key' }).click();
      await expect(page.getByText('Provider saved. No request has been sent.')).toBeVisible();
      expect(
        await app.evaluate(
          () => (globalThis as unknown as { presetCalls: unknown[] }).presetCalls.length,
        ),
      ).toBe(count);
      await page.getByRole('button', { name: 'Test vision connection (uses API credits)' }).click();
      await expect(
        page.getByText('Vision connection works. You can now classify photos.'),
      ).toBeVisible();
      count++;
    }
    const calls = await app.evaluate(
      () =>
        (globalThis as unknown as { presetCalls: { correctKey: boolean; endpoint: string }[] })
          .presetCalls,
    );
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.correctKey)).toBe(true);
    expect(calls[0]!.endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(calls[1]!.endpoint).toBe('https://api.openai.com/v1/chat/completions');
  } finally {
    await app.close();
  }
});
