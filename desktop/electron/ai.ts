import type { Backend } from './backend';
import { visionBody, parseCategories, categories, referenceBatches } from './vision';
import { dialog, ipcMain, safeStorage, type BrowserWindow } from 'electron';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiConfiguration, AiStatus, AiTask } from '../shared/ai';
import { assertSender } from './security';
import { generate, validateConfiguration, validateKey } from './ai-provider';

export function installAi(window: BrowserWindow, profile: string, backend: Backend) {
  const file = join(profile, 'ai-credential.bin');
  let active: AbortController | null = null;
  let changing = false;
  const empty: AiStatus = { configured: false, endpoint: '', model: '', protocol: 'chat' };
  async function load(): Promise<(AiConfiguration & { key: string }) | null> {
    try {
      const encrypted = await readFile(file);
      if (encrypted.length > 16384) return null;
      const { result } = await safeStorage.decryptStringAsync(encrypted);
      const data = JSON.parse(result);
      return { ...validateConfiguration(data), key: validateKey(data.key) };
    } catch {
      return null;
    }
  }
  function publicStatus(value: (AiConfiguration & { key: string }) | null): AiStatus {
    return value
      ? { configured: true, endpoint: value.endpoint, model: value.model, protocol: value.protocol }
      : empty;
  }
  ipcMain.handle('thing:ai', async (event, ...args: unknown[]) => {
    assertSender(event, window.webContents, []);
    if (args.length !== 2) throw new Error('Invalid AI request.');
    const [action, payload] = args;
    if (['status', 'remove', 'cancel', 'testVision'].includes(String(action)) && payload !== null)
      throw new Error('Invalid AI request.');
    if (action === 'status') return publicStatus(await load());
    if (action === 'cancel') {
      active?.abort();
      return null;
    }
    if (action === 'remove') {
      if (changing) throw new Error('Wait for the settings change to finish.');
      changing = true;
      try {
        active?.abort();
        await rm(file, { force: true });
        return empty;
      } catch {
        throw new Error('The saved key could not be removed. Try again.');
      } finally {
        changing = false;
      }
    }
    if (action === 'save') {
      if (changing || active) throw new Error('Finish or cancel the current request first.');
      const config = validateConfiguration(payload);
      const supplied = (payload as Record<string, unknown>).key;
      changing = true;
      try {
        const previous = await load();
        const key =
          supplied === '' &&
          previous &&
          new URL(previous.endpoint).origin === new URL(config.endpoint).origin
            ? previous.key
            : validateKey(supplied);
        const approval = await dialog.showMessageBox(window, {
          type: 'question',
          title: 'Use your AI provider?',
          message: `Your key and explicitly selected notes or photo previews will be sent to ${new URL(config.endpoint).origin} when you explicitly run an AI tool.`,
          detail: `Endpoint: ${config.endpoint}\nModel: ${config.model}\nOnly use an endpoint you trust. Your provider's billing and data policies apply. Saving does not send a request.`,
          buttons: ['Cancel', 'Save my provider'],
          defaultId: 0,
          cancelId: 0,
        });
        if (approval.response !== 1) return publicStatus(await load());
        if (!(await safeStorage.isAsyncEncryptionAvailable()))
          throw new Error('Windows credential protection is unavailable.');
        const encrypted = await safeStorage.encryptStringAsync(JSON.stringify({ ...config, key }));
        await mkdir(profile, { recursive: true });
        await writeFile(`${file}.tmp`, encrypted, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
        return { ...config, configured: true };
      } catch {
        throw new Error(
          'Could not securely save the key. Check Windows credential protection and try again.',
        );
      } finally {
        changing = false;
      }
    }
    if (action === 'analyze' || action === 'testVision') {
      if (active || changing)
        throw new Error('An AI request or settings change is already running.');
      const testing = action === 'testVision';
      const p = (
        testing
          ? { id: '0'.repeat(32), consent: true, people: false, categories: ['objects'] }
          : payload
      ) as {
        id?: unknown;
        consent?: unknown;
        people?: unknown;
        categories?: unknown;
        discover?: unknown;
      } | null;
      if (
        !p ||
        p.consent !== true ||
        typeof p.people !== 'boolean' ||
        !Array.isArray(p.categories) ||
        p.categories.length > 55 ||
        !p.categories.every(
          (c) =>
            typeof c === 'string' && /^[a-z][a-z0-9 -]{0,39}$/.test(c) && !c.startsWith('person '),
        ) ||
        (!p.categories.length && !p.people && !p.discover) ||
        (p.discover !== undefined && typeof p.discover !== 'boolean') ||
        typeof p.id !== 'string' ||
        !/^[a-f0-9]{32}$/.test(p.id)
      )
        throw new Error('Select a photo and allow preview sharing.');
      const controller = new AbortController();
      active = controller;
      try {
        if (!testing) {
          const photo = (await backend.call('/catalog/detail', 'POST', { id: p.id })) as {
            categorized?: boolean;
            tags?: string[];
          };
          if (photo.categorized) return { tags: photo.tags ?? [], alreadyCategorized: true };
        }
        const config = await load();
        if (!config) throw new Error('Save your own vision-capable provider and API key first.');
        if (
          new URL(config.endpoint).hostname === 'api.groq.com' &&
          /^openai\/gpt-oss-/.test(config.model)
        )
          throw new Error(
            'GPT-OSS on Groq is text-only. Open API key, choose Groq vision settings, and save. Use a vision model such as qwen/qwen3.8-27b for photos.',
          );
        if (new URL(config.endpoint).hostname === 'api.groq.com' && config.protocol !== 'chat')
          throw new Error(
            'For Groq photo classification, select Chat Completions or use the Groq vision preset.',
          );
        const image = async (id: string) => {
          const data = await backend.bytes(`/photos/${id}/thumbnail`);
          if (data.length > 2 * 1024 * 1024) throw new Error('This preview is too large.');
          return 'data:image/jpeg;base64,' + Buffer.from(data).toString('base64');
        };
        const target = testing
          ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAmUlEQVR4nO3aUQmEAAAE0XG4VkaygQFsYKO7EkYwhRnkEBn0/S8s7O8O+/alTOIkTuIkTuIkTuIkTuIkTuIkTuIkTuI+ZwPLOHGx+bc+aAGJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJG97D080kTuIkTuIkTuIkTuIkTuIkTuK8u8C/DopLCJEQ+KyRAAAAAElFTkSuQmCC'
          : await image(p.id);
        const references = p.people
          ? ((await backend.call('/catalog/people', 'GET')) as { id: string; label: string }[])
          : [];
        const inputs: { label: string; image: string }[] = [];
        for (const ref of references.slice(0, 8)) {
          if (controller.signal.aborted) throw new Error('AI request cancelled.');
          inputs.push({ label: ref.label, image: await image(ref.id) });
        }
        if (controller.signal.aborted) throw new Error('AI request cancelled.');
        const categoryNames = (await backend.call('/catalog/category-names', 'GET')) as Record<
          string,
          string
        >;
        const selected = p.categories as string[];
        if (selected.some((label) => !categories.includes(label) && !(label in categoryNames)))
          throw new Error('Choose an existing category.');
        const batches = referenceBatches(config, inputs);
        const matched = new Set<string>();
        for (const [batchIndex, refs] of batches.entries()) {
          if (controller.signal.aborted) throw new Error('AI request cancelled.');
          const text = await generate(
            config,
            config.key,
            'tags',
            '',
            controller.signal,
            visionBody(
              config,
              target,
              refs,
              batchIndex === 0 ? selected : [],
              batchIndex === 0 && p.discover === true,
              categoryNames,
            ),
          );
          for (const tag of parseCategories(
            text,
            refs.map((r) => r.label),
            selected,
            batchIndex === 0 && p.discover === true,
          )) {
            if (
              selected.includes(tag) ||
              refs.some((r) => r.label === tag) ||
              (batchIndex === 0 && p.discover && !tag.startsWith('person '))
            )
              matched.add(tag);
          }
        }
        if (controller.signal.aborted) throw new Error('AI request cancelled.');
        if (testing) return { tags: [...matched] };
        return await backend.call('/catalog/auto-categories', 'POST', {
          id: p.id,
          tags: [...matched],
          scope: [...new Set([...selected, ...inputs.map((r) => r.label), ...matched])],
        });
      } finally {
        active = null;
      }
    }
    if (action === 'run') {
      if (active || changing)
        throw new Error('An AI request or settings change is already running.');
      if (!payload || typeof payload !== 'object') throw new Error('Enter notes to send.');
      const p = payload as Record<string, unknown>;
      if (
        p.consent !== true ||
        typeof p.notes !== 'string' ||
        !p.notes.trim() ||
        p.notes.length > 6000 ||
        !['caption', 'tags', 'album'].includes(String(p.task))
      )
        throw new Error('Choose a task, enter up to 6,000 characters, and allow this request.');
      const controller = new AbortController();
      active = controller;
      try {
        const config = await load();
        if (!config) throw new Error('Save your own provider and API key first.');
        if (controller.signal.aborted) throw new Error('AI request cancelled.');
        const text = await generate(
          config,
          config.key,
          p.task as AiTask,
          p.notes,
          controller.signal,
        );
        return { text: text.replaceAll(config.key, '[redacted]') };
      } finally {
        active = null;
      }
    }
    throw new Error('Invalid AI action.');
  });
  return { stop: () => active?.abort() };
}
