import { _electron as electron, test, expect } from '@playwright/test';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const loadModule = createRequire(resolve('tests/ai.spec.ts'));
const { validateConfiguration, validateKey, makeBody, extractText } = loadModule(
  '../dist-electron/electron/ai-provider.js',
);

test('provider validation and both wire formats have bounded text-only requests', () => {
  for (const endpoint of [
    'http://example.com/chat',
    'https://user:password@example.com/chat',
    'https://example.com/chat?key=x',
    'file:///x',
    'https://example.com/',
  ]) {
    expect(() =>
      validateConfiguration({ endpoint, model: 'my-model', protocol: 'chat' }),
    ).toThrow();
  }
  expect(() => validateKey('secret\r\nHeader: value')).toThrow();
  expect(() => validateKey('')).toThrow();
  const config = validateConfiguration({
    endpoint: 'https://provider.example/v1/chat/completions',
    model: 'owner/my-model',
    protocol: 'chat',
  });
  const body = makeBody(config, 'tags', 'A day at the beach');
  expect(body.messages[1]).toEqual({ role: 'user', content: 'A day at the beach' });
  expect(body.max_tokens).toBe(1200);
  expect(body.stream).toBe(false);
  const responseBody = makeBody({ ...config, protocol: 'responses' }, 'album', 'Mountain trip');
  expect(responseBody.store).toBe(false);
  expect(responseBody.input).toBe('Mountain trip');
  expect(responseBody.max_output_tokens).toBe(1200);
  expect(extractText({ choices: [{ message: { content: 'Sunshine' } }] }, 'chat')).toBe('Sunshine');
  expect(
    extractText(
      { output: [{ content: [{ type: 'output_text', text: 'Adventure' }] }] },
      'responses',
    ),
  ).toBe('Adventure');
  expect(() => extractText({ error: 'sensitive provider error' }, 'chat')).toThrow();
});

test('English-only UI, encrypted user key, consent, generation, errors, cancellation, restart and removal', async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), 'thing-byok-'));
  const profile = join(root, 'profile');
  const fakeKey = 'test-only-user-owned-credential-12345';
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
    await expect(page.getByRole('status')).toHaveText('Health OK', { timeout: 30_000 });
    await page.evaluate(() => localStorage.setItem('thing-language', 'ar'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.getByRole('button', { name: 'Preferences', exact: true }).click();
    await expect(page.getByText('English', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close preferences' }).click();
    await page.getByRole('button', { name: /API key/ }).click();
    await expect(page.getByText('AI is off — add your own key to begin')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate with my key' })).toBeDisabled();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await page
      .getByLabel('API base URL or full endpoint')
      .fill('https://provider.example/v1/chat/completions');
    await page.getByLabel('Model ID', { exact: true }).fill('my-private-model');
    await page.getByLabel('Your API key', { exact: true }).fill(fakeKey);
    await page.getByRole('button', { name: 'Save provider & key' }).click();
    await expect(page.getByText('Provider saved. No request has been sent.')).toBeVisible();
    await expect(page.getByLabel('Your API key', { exact: true })).toHaveValue('');
    const encrypted = await readFile(join(profile, 'ai-credential.bin'));
    expect(encrypted.includes(Buffer.from(fakeKey))).toBe(false);
    expect(encrypted.includes(Buffer.from('provider.example'))).toBe(false);
    expect(await page.evaluate(() => window.thingSorted.ai('status', null))).toEqual({
      configured: true,
      endpoint: 'https://provider.example/v1/chat/completions',
      model: 'my-private-model',
      protocol: 'chat',
    });

    // Replace HTTPS only in this isolated test process. No live keys, paid calls, or network fixtures.
    await app.evaluate(() => {
      const https = process.getBuiltinModule('https');
      const { EventEmitter } = process.getBuiltinModule('events');
      const state = { calls: [] as { endpoint: string; body: unknown }[], mode: 'success' };
      (globalThis as unknown as { aiTest: typeof state }).aiTest = state;
      https.request = (
        endpoint: string,
        options: { signal: AbortSignal },
        callback: (res: unknown) => void,
      ) => {
        const req = new EventEmitter();
        req.destroy = () => {
          req.emit('error', new Error('network'));
          req.emit('close');
        };
        options.signal.addEventListener('abort', () => req.destroy(), { once: true });
        req.end = (data: string) => {
          state.calls.push({ endpoint, body: JSON.parse(data) });
          if (state.mode === 'wait') return;
          queueMicrotask(() => {
            const res = new EventEmitter();
            res.statusCode = state.mode === 'quota' ? 429 : state.mode === 'redirect' ? 302 : 200;
            res.destroy = () => req.emit('close');
            callback(res);
            if (res.statusCode === 200) {
              res.emit(
                'data',
                Buffer.from(
                  JSON.stringify({
                    choices: [{ message: { content: 'Golden evening by the sea.' } }],
                  }),
                ),
              );
              res.emit('end');
              req.emit('close');
            }
          });
        };
        return req;
      };
    });
    await page.getByLabel('Notes to send').fill('Sunset by the sea with friends');
    await expect(page.getByRole('button', { name: 'Generate with my key' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /Send these notes/ }).check();
    await page.getByRole('button', { name: 'Generate with my key' }).click();
    await expect(page.getByText('Golden evening by the sea.')).toBeVisible();
    const calls = await app.evaluate(
      () => (globalThis as unknown as { aiTest: { calls: { body: unknown }[] } }).aiTest.calls,
    );
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain(fakeKey);
    expect(JSON.stringify(calls)).toContain('Sunset by the sea with friends');
    await expect(page.getByRole('checkbox', { name: /Send these notes/ })).not.toBeChecked();
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'thing-sorted-api-key.png'),
        animations: 'disabled',
      });
    for (const [mode, error] of [
      ['quota', 'Provider quota or rate limit reached.'],
      ['redirect', 'Provider request failed (HTTP 302).'],
    ] as const) {
      await app.evaluate((_electron, mode) => {
        (globalThis as unknown as { aiTest: { mode: string } }).aiTest.mode = mode;
      }, mode);
      await page.getByRole('checkbox', { name: /Send these notes/ }).check();
      await page.getByRole('button', { name: 'Generate with my key' }).click();
      await expect(page.locator('.ai-panel').getByRole('status')).toContainText(error);
    }
    await app.evaluate(() => {
      (globalThis as unknown as { aiTest: { mode: string } }).aiTest.mode = 'wait';
    });
    await page.getByRole('checkbox', { name: /Send these notes/ }).check();
    await page.getByRole('button', { name: 'Generate with my key' }).click();
    await page.getByRole('button', { name: 'Cancel request' }).click();
    await expect(page.locator('.ai-panel').getByRole('status')).toContainText(
      'AI request cancelled.',
    );
    await app.close();
    app = await electron.launch(launch);
    page = await app.firstWindow();
    await page.getByRole('button', { name: /API key/ }).click();
    await expect(page.getByText('Your provider is configured')).toBeVisible();
    await expect(page.getByLabel('Your API key', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Remove key' }).click();
    await expect(page.getByText('Key removed. AI is off.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate with my key' })).toBeDisabled();
    await expect(access(join(profile, 'ai-credential.bin'))).rejects.toThrow();
  } finally {
    await app.close();
  }
});
