import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { Backend } from './backend';
import { sourcePath } from './imports';
import { assertSender } from './security';
import type { ArchiveStatus } from '../shared/maintenance';

export function installMaintenance(window: BrowserWindow, backend: Backend): void {
  let picking = false;
  ipcMain.handle('thing:archive', async (event, ...args: unknown[]) => {
    assertSender(event, window.webContents, []);
    const action = args[0];
    if (
      args.length !== 1 ||
      !['status', 'backup', 'restore', 'resume', 'cancel'].includes(String(action))
    )
      throw new Error('Invalid archive request.');
    if (action === 'status') return backend.call<ArchiveStatus>('/maintenance/status');
    if (action === 'resume' || action === 'cancel')
      return backend.call<ArchiveStatus>(`/maintenance/${action}`, 'POST', {});
    if (picking) throw new Error('A folder selection is already open.');
    picking = true;
    try {
      const confirmation = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'thing sorted',
        message:
          action === 'backup'
            ? 'Create a local backup containing copied originals, filenames, trips, dates and stored GPS coordinates? Original files may contain location metadata even when location display is hidden. Previews are regenerated on restore. Nothing is uploaded.'
            : 'Restore a backup into an empty collection and a new original-photo folder? Existing collections will not be replaced. Backup originals may contain GPS metadata. Your source backup stays unchanged.',
        buttons: ['Cancel', 'Continue'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return backend.call<ArchiveStatus>('/maintenance/status');
      let source: string | undefined;
      if (action === 'restore') {
        const chosen = await dialog.showOpenDialog(window, {
          title: 'Choose a thing sorted backup folder',
          properties: ['openDirectory'],
        });
        if (chosen.canceled || !chosen.filePaths[0])
          return backend.call<ArchiveStatus>('/maintenance/status');
        source = await sourcePath(chosen.filePaths[0]);
      }
      const chosen = await dialog.showOpenDialog(window, {
        title:
          action === 'backup'
            ? 'Choose where to save the backup'
            : 'Choose where restored originals will live',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (chosen.canceled || !chosen.filePaths[0])
        return backend.call<ArchiveStatus>('/maintenance/status');
      return backend.call<ArchiveStatus>(`/maintenance/${String(action)}`, 'POST', {
        path: await sourcePath(chosen.filePaths[0]),
        ...(source ? { source } : {}),
      });
    } finally {
      picking = false;
    }
  });
}
