import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, parse, resolve } from 'node:path';
import { Backend } from './backend';
import { assertSender } from './security';
import type { ImportJob, PhotoPage } from '../shared/contracts';

const extensions = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'tif',
  'tiff',
  'bmp',
  'gif',
  'avif',
  'dng',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'arw',
  'sr2',
  'orf',
  'rw2',
  'raf',
  'pef',
  'raw',
  'rwl',
  '3fr',
  'iiq',
];
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

export async function sourcePath(value: string): Promise<string> {
  if (value.startsWith('\\\\') || value.startsWith('//'))
    throw new Error('Choose files on a local drive.');
  const absolute = resolve(value);
  if ((await realpath(absolute)).toLowerCase() !== absolute.toLowerCase())
    throw new Error('Linked files are not supported.');
  let current = absolute;
  while (current !== parse(current).root) {
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked files are not supported.');
    current = dirname(current);
  }
  return absolute;
}

export function installImports(window: BrowserWindow, backend: Backend) {
  let picking = false;
  let preparing = false;
  let active: { id: string; controller: AbortController } | null = null;
  const guard = (event: Parameters<typeof assertSender>[0], args: unknown[], count = 0) => {
    assertSender(event, window.webContents, []);
    if (args.length !== count) throw new Error('This request is not allowed.');
  };

  async function enqueue(paths: string[], fromPicker = false): Promise<ImportJob> {
    if (active || preparing || (picking && !fromPicker))
      throw new Error('An import is already in progress.');
    preparing = true;
    try {
      const files = await Promise.all(
        paths.map(async (path) => {
          try {
            const safe = await sourcePath(path);
            const info = await lstat(safe);
            return {
              path: safe,
              name: basename(path),
              size: info.isFile() ? info.size : 0,
              modified_ms: Math.max(0, info.mtimeMs),
            };
          } catch {
            return { path: '', name: basename(path), size: 0, modified_ms: null };
          }
        }),
      );
      const job = await backend.call<ImportJob>('/jobs', 'POST', {
        files: files.map(({ name, size, modified_ms }) => ({ name, size, modified_ms })),
      });
      const controller = new AbortController();
      active = { id: job.id, controller };
      // Native picker paths never enter renderer state or the backend API.
      void (async () => {
        for (let index = 0; index < files.length; index++) {
          if (controller.signal.aborted) break;
          const file = files[index]!;
          const item = job.items[index]!;
          if (item.state !== 'pending') continue;
          let handle: Awaited<ReturnType<typeof open>> | undefined;
          try {
            handle = await open(await sourcePath(file.path), 'r');
            const current = await handle.stat();
            if (!current.isFile() || current.size !== file.size) throw new Error('Source changed.');
            await backend.upload(item.id, handle, file.size, controller.signal);
          } catch {
            if (!controller.signal.aborted) {
              try {
                await backend.call(`/uploads/${item.id}/reject`, 'POST', {});
              } catch {
                break;
              } // Durable jobs explain interrupted copies after recovery.
            }
          } finally {
            if (handle) await handle.close().catch(() => undefined);
          }
        }
      })().finally(() => {
        active = null;
      });
      return job;
    } finally {
      preparing = false;
    }
  }

  ipcMain.handle('thing:photos', (event, ...args: unknown[]) => {
    guard(event, args, 1);
    const page = args[0];
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 100000)
      throw new Error('Invalid page.');
    return backend.call<PhotoPage>(`/photos?page=${page}`);
  });
  ipcMain.handle('thing:latest-import', (event, ...args: unknown[]) => {
    guard(event, args);
    return backend.call<ImportJob | null>('/jobs/latest');
  });
  ipcMain.handle('thing:cancel-import', async (event, ...args: unknown[]) => {
    guard(event, args, 1);
    if (!validId(args[0])) throw new Error('Invalid import.');
    const job = await backend.call<ImportJob>(`/jobs/${args[0]}/cancel`, 'POST', {});
    if (active?.id === args[0]) active.controller.abort();
    return job;
  });
  ipcMain.handle('thing:retry-import', (event, ...args: unknown[]) => {
    guard(event, args, 1);
    if (!validId(args[0])) throw new Error('Invalid import.');
    return backend.call<ImportJob>(`/jobs/${args[0]}/retry`, 'POST', {});
  });
  ipcMain.handle('thing:import-photos', async (event, ...args: unknown[]) => {
    guard(event, args);
    if (picking || active || preparing) throw new Error('An import is already in progress.');
    if (backend.status().phase !== 'ready')
      throw new Error('Wait for the local connection to be ready.');
    picking = true;
    try {
      const summary = await backend.call<{ configured: boolean }>('/library');
      if (!summary.configured) {
        const location = await dialog.showOpenDialog(window, {
          title: 'Choose where copies of your photos will live',
          buttonLabel: 'Use this location',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (location.canceled || !location.filePaths[0]) return null;
        await backend.call('/library', 'POST', { path: await sourcePath(location.filePaths[0]) });
      }
      const selection = await dialog.showOpenDialog(window, {
        title: 'Choose photos to copy into your library',
        buttonLabel: 'Import photos',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Photos and camera originals', extensions },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (selection.canceled || selection.filePaths.length === 0) return null;
      if (selection.filePaths.length > 200) throw new Error('Choose up to 200 photos per import.');
      return await enqueue(selection.filePaths, true);
    } finally {
      picking = false;
    }
  });
  return {
    enqueue: (paths: string[]) => enqueue(paths),
    busy: () => picking || preparing || active !== null,
  };
}

export async function photoResource(request: Request, backend: Backend): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/photos\/([a-f0-9]{32})\/(thumbnail|preview)$/.exec(url.pathname);
  if (!url.pathname.startsWith('/photos/')) return null;
  if (!match || request.method !== 'GET' || url.host !== 'app' || url.search)
    return new Response('Not found', { status: 404 });
  try {
    const image = await backend.bytes(`/photos/${match[1]}/${match[2]}`);
    return new Response(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Preview unavailable', { status: 404 });
  }
}
