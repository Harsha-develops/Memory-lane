import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export function readBounds(directory: string): Partial<Rectangle> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(directory, 'window.json'), 'utf8'));
    if (!value || typeof value !== 'object') return {};
    const bounds = value as Rectangle;
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return {};
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(Math.max(820, bounds.width), area.width);
    const height = Math.min(Math.max(640, bounds.height), area.height);
    return {
      width,
      height,
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    };
  } catch {
    return {};
  } // Missing or invalid state uses the default centered window.
}

export function rememberBounds(window: BrowserWindow, directory: string): void {
  window.on('close', () => {
    try {
      const path = join(directory, 'window.json');
      writeFileSync(path + '.tmp', JSON.stringify(window.getNormalBounds()), {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(path + '.tmp', path);
    } catch {
      /* A read-only profile must not prevent closing the application. */
    }
  });
}
