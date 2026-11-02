import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { lstat, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, isAbsolute } from 'node:path';
import { Backend } from './backend';
import { sourcePath } from './imports';
import { assertSender } from './security';
import type { ImportJob } from '../shared/contracts';
import type { WatchStatus } from '../shared/maintenance';

const extensions = new Set(
  'jpg jpeg png webp heic heif tif tiff bmp gif avif dng cr2 cr3 nef nrw arw sr2 orf rw2 raf pef raw rwl 3fr iiq'.split(
    ' ',
  ),
);
function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}
export class FolderWatcher {
  private folder: string | null = null;
  private seen: Record<string, string> = Object.create(null) as Record<string, string>;
  private pending = new Map<string, { signature: string; since: number }>();
  private state: WatchStatus['state'] = 'off';
  private enabled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly config: string;
  constructor(
    private readonly window: BrowserWindow,
    private readonly backend: Backend,
    private readonly profile: string,
    private readonly importer: {
      enqueue: (paths: string[]) => Promise<ImportJob>;
      busy: () => boolean;
    },
  ) {
    this.config = join(profile, 'watch-folder.json');
  }
  status(): WatchStatus {
    return {
      enabled: this.enabled,
      folder: this.folder ? basename(this.folder) : null,
      state: this.state,
    };
  }
  async start() {
    try {
      if ((await lstat(this.config)).size > 2 * 1024 * 1024)
        throw new Error('Invalid watch configuration');
      const value: unknown = JSON.parse(await readFile(this.config, 'utf8'));
      if (
        value &&
        typeof value === 'object' &&
        'folder' in value &&
        typeof value.folder === 'string' &&
        'enabled' in value &&
        value.enabled === true
      ) {
        this.folder = value.folder;
        this.enabled = true;
        if (
          'seen' in value &&
          value.seen &&
          typeof value.seen === 'object' &&
          !Array.isArray(value.seen)
        )
          this.seen = Object.fromEntries(
            Object.entries(value.seen)
              .filter(([key, signature]) => key.length <= 260 && typeof signature === 'string')
              .slice(0, 10000),
          );
      }
    } catch {
      this.enabled = false;
    } // A missing or invalid preference never enables watching.
    ipcMain.handle('thing:watch', async (event, ...args: unknown[]) => {
      assertSender(event, this.window.webContents, []);
      if (args.length !== 1 || !['status', 'choose', 'disable'].includes(String(args[0])))
        throw new Error('Invalid watch request.');
      if (args[0] === 'disable') {
        this.enabled = false;
        this.state = 'off';
        this.pending.clear();
        await this.save();
      }
      if (args[0] === 'choose') {
        const library = await this.backend.call<{ path: string | null }>('/library/location');
        if (!library.path)
          throw new Error(
            'Import photos and choose your library before enabling a watched folder.',
          );
        const selected = await dialog.showOpenDialog(this.window, {
          title: 'Watch this folder while Memory Lane is open (subfolders excluded)',
          properties: ['openDirectory'],
        });
        if (selected.canceled || !selected.filePaths[0]) return this.status();
        const folder = await sourcePath(selected.filePaths[0]);
        this.validate(folder, library.path);
        const answer = await dialog.showMessageBox(this.window, {
          title: 'Memory Lane',
          type: 'question',
          message:
            'Automatically copy supported photos already in this folder, and future additions, while the app is open? Files must remain stable for at least six seconds. Subfolders and temporary files are ignored. Source files are never changed.',
          buttons: ['Cancel', 'Enable watching'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (answer.response !== 1) return this.status();
        this.folder = folder;
        this.seen = Object.create(null) as Record<string, string>;
        this.pending.clear();
        this.enabled = true;
        this.state = 'waiting';
        await this.save();
      }
      return this.status();
    });
    void this.tick();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
  private validate(folder: string, library: string) {
    if (
      contains(folder, this.profile) ||
      contains(this.profile, folder) ||
      contains(folder, library) ||
      contains(library, folder)
    )
      throw new Error('Choose a folder separate from app storage and the original-photo library.');
  }
  private async save() {
    const temporary = this.config + '.tmp';
    await writeFile(
      temporary,
      JSON.stringify({ enabled: this.enabled, folder: this.folder, seen: this.seen }),
      'utf8',
    );
    await rename(temporary, this.config);
  }
  private async tick() {
    try {
      if (!this.enabled || !this.folder) {
        this.state = 'off';
        return;
      }
      if (this.backend.status().phase !== 'ready' || this.importer.busy()) {
        this.state = 'waiting';
        return;
      }
      const folder = await sourcePath(this.folder);
      const library = await this.backend.call<{ path: string | null }>('/library/location');
      if (!library.path) {
        this.state = 'waiting';
        return;
      }
      this.validate(folder, library.path);
      const latest = await this.backend.call<ImportJob | null>('/jobs/latest');
      if (latest?.active) {
        this.state = 'importing';
        return;
      }
      const entries = await readdir(folder, { withFileTypes: true });
      if (entries.length > 10000) throw new Error('Too many watch entries');
      const paths: string[] = [];
      let bytes = 0;
      const signatures: [string, string][] = [];
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          !extensions.has(extname(entry.name).slice(1).toLowerCase()) ||
          entry.name.startsWith('~') ||
          entry.name.startsWith('.')
        )
          continue;
        const path = join(folder, entry.name);
        const info = await lstat(path);
        if (!info.isFile() || info.size === 0 || info.size > 256 * 1024 * 1024) continue;
        const signature = `${info.size}:${info.mtimeMs}`;
        if (this.seen[entry.name] === signature) continue;
        const previous = this.pending.get(entry.name);
        if (!previous || previous.signature !== signature) {
          this.pending.set(entry.name, { signature, since: Date.now() });
          continue;
        }
        if (
          Date.now() - previous.since < 6000 ||
          paths.length >= 200 ||
          bytes + info.size > 2 * 1024 ** 3
        )
          continue;
        paths.push(path);
        signatures.push([entry.name, signature]);
        bytes += info.size;
      }
      this.state = 'watching';
      if (paths.length && this.enabled && this.folder === folder && !this.stopped) {
        const job = await this.importer.enqueue(paths);
        if (job.id) {
          for (const [name, signature] of signatures) {
            this.seen[name] = signature;
            this.pending.delete(name);
          }
          await this.save();
          this.state = 'importing';
        }
      }
      const currentNames = new Set(entries.map((entry) => entry.name));
      for (const name of this.pending.keys())
        if (!currentNames.has(name)) this.pending.delete(name);
      for (const name of Object.keys(this.seen))
        if (!currentNames.has(name)) delete this.seen[name];
    } catch {
      this.state = 'unavailable';
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 3000);
    }
  }
}
