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
  query: {
    path: '/query',
    fields: {
      offset: number(1000000),
      limit: number(200),
      trip: (v) => v === 'unassigned' || optionalId(v),
      start: date,
      end: date,
      search: optionalString(100),
      tag: optionalString(40),
    },
  },
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
    fields: { id: optionalId, title: string(120), start: date, end: date },
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
    if (action === 'deleteTrip' || action === 'forgetLocations' || action === 'groupDates') {
      const text =
        action === 'deleteTrip'
          ? 'Remove this trip? Its photos will stay in your library.'
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
