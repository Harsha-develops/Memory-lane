import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { Backend } from './backend';
import { assertSender } from './security';

type Check = (value: unknown) => boolean;
const id: Check = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const optionalId: Check = (value) => value === null || value === undefined || id(value);
const date: Check = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
const number =
  (max: number): Check =>
  (value) =>
    value === undefined ||
    (Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= max);
const string =
  (max: number): Check =>
  (value) =>
    typeof value === 'string' && value.length <= max;
const optionalString =
  (max: number): Check =>
  (value) =>
    value === undefined || string(max)(value);
const bool: Check = (value) => typeof value === 'boolean';
const specs: Record<string, { path: string; method?: string; fields: Record<string, Check> }> = {
  saveAlbum: {
    path: '/save-album',
    fields: { ids: (v) => Array.isArray(v) && v.length > 0 && v.length <= 200 && v.every(id) },
  },
  query: {
    path: '/query',
    fields: {
      uncategorized: (v) => v === undefined || bool(v),
      offset: number(1000000),
      limit: number(200),
      trip: (v) => v === 'unassigned' || optionalId(v),
      start: date,
      end: date,
      search: optionalString(100),
      tag: optionalString(40),
    },
  },
  correctCategory: {
    path: '/correct-category',
    fields: { id, label: (v) => typeof v === 'string' && /^[a-z][a-z0-9 -]{0,39}$/.test(v) },
  },
  organize: {
    path: '/organize',
    fields: { id, label: (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9 -]{0,39}$/.test(v) },
  },
  categoryNames: { path: '/category-names', method: 'GET', fields: {} },
  renameCategory: { path: '/category-name', fields: { label: string(40), name: string(40) } },
  albums: { path: '/albums', method: 'GET', fields: {} },
  personNames: { path: '/person-names', method: 'GET', fields: {} },
  renamePerson: {
    path: '/person-name',
    fields: {
      label: (v) => typeof v === 'string' && /^person [1-9][0-9]{0,5}$/.test(v),
      name: string(80),
    },
  },
  categories: { path: '/categories', method: 'GET', fields: {} },
  people: { path: '/people', method: 'GET', fields: {} },
  newPerson: { path: '/person-reference', fields: { id } },
  removePerson: { path: '/person-reference/remove', fields: { id } },
  saveTags: {
    path: '/tags',
    fields: {
      id,
      tags: (v) =>
        Array.isArray(v) &&
        v.length <= 64 &&
        v.every((t) => typeof t === 'string' && /^[a-z0-9][a-z0-9 -]{0,39}$/.test(t)),
    },
  },
  detail: { path: '/detail', fields: { id } },
  trips: { path: '/trips', method: 'GET', fields: {} },
  saveTrip: {
    path: '/trip',
    fields: {
      id: optionalId,
      title: string(120),
      start: date,
      end: date,
      kind: (v) => v === undefined || v === 'trip' || v === 'album',
    },
  },
  deleteTrip: { path: '/trip/delete', fields: { id } },
  move: {
    path: '/move',
    fields: {
      ids: (v) => Array.isArray(v) && v.length > 0 && v.length <= 500 && v.every(id),
      trip: optionalId,
    },
  },
  cover: { path: '/cover', fields: { id, photo: id } },
  groupDates: { path: '/group-dates', fields: {} },
  orbit: { path: '/orbit', fields: { grouping: (v) => v === 'trip' || v === 'month' } },
  privacy: { path: '/privacy', method: 'GET', fields: {} },
  setPrivacy: { path: '/privacy', fields: { showGps: bool, storeGps: bool } },
  forgetLocations: { path: '/forget-locations', fields: {} },
  similar: { path: '/similar', method: 'GET', fields: {} },
  scanSimilar: { path: '/similar/scan', fields: {} },
  reviewSimilar: {
    path: '/similar/review',
    fields: { id, decision: (v) => v === 'keep' || v === 'similar' },
  },
};

export function installCatalog(window: BrowserWindow, backend: Backend): void {
  ipcMain.handle('thing:catalog', async (event, ...args: unknown[]) => {
    assertSender(event, window.webContents, []);
    const [action, input] = args;
    if (
      args.length !== 2 ||
      typeof action !== 'string' ||
      !Object.hasOwn(specs, action) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    )
      throw new Error('Invalid collection request.');
    const spec = specs[action]!;
    const values = input as Record<string, unknown>;
    if (
      Object.keys(values).some((key) => !Object.hasOwn(spec.fields, key)) ||
      Object.entries(spec.fields).some(([key, check]) => !check(values[key]))
    )
      throw new Error('Invalid collection values.');
    if (action === 'saveAlbum') {
      const choice = await dialog.showOpenDialog(window, {
        title: 'Categorisation Complete — Where Should This Album Be Saved?',
        buttonLabel: 'Save Organised Album Here',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (choice.canceled || !choice.filePaths[0]) return { cancelled: true, saved: 0, errors: [] };
      const ids = [...new Set(values.ids as string[])];
      const plan = await backend.call<{ batch: string; folder: string }>(
        '/catalog/save-album',
        'POST',
        { ids, parent: choice.filePaths[0] },
      );
      let saved = 0;
      const errors: string[] = [];
      for (const photoId of ids) {
        try {
          await backend.call('/catalog/save-photo', 'POST', { id: photoId, batch: plan.batch });
          saved++;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : 'A photo could not be moved.');
          break;
        }
      }
      return { cancelled: false, folder: plan.folder, saved, errors };
    }
    if (action === 'deleteTrip' || action === 'forgetLocations' || action === 'groupDates') {
      const text =
        action === 'deleteTrip'
          ? 'Remove this trip or album? Its photos will stay in your library.'
          : action === 'forgetLocations'
            ? 'Remove stored location coordinates from this app and stop collecting new coordinates? Original photos are not modified.'
            : 'Group all unassigned photos into editable trips by their recorded dates? File-modified and import dates may not reflect when a photo was taken.';
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Memory Lane',
        message: text,
        buttons: ['Cancel', 'Continue'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1) throw new Error('Action cancelled.');
    }
    return backend.call(
      '/catalog' + spec.path,
      spec.method ?? 'POST',
      spec.method === 'GET' ? undefined : input,
    );
  });
}
