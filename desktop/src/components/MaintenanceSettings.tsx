import { useEffect, useState } from 'react';
import type {
  ArchiveAction,
  ArchiveStatus,
  WatchAction,
  WatchStatus,
} from '../../shared/maintenance';
import { tr, language } from '../i18n';

export function MaintenanceSettings() {
  const [archive, setArchive] = useState<ArchiveStatus>({
    state: 'idle',
    kind: null,
    done: 0,
    total: 0,
    message: '',
  });
  const [watch, setWatch] = useState<WatchStatus>({ enabled: false, folder: null, state: 'off' });
  const [message, setMessage] = useState('');
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const [a, w] = await Promise.all([
          window.thingSorted.archive('status'),
          window.thingSorted.watch('status'),
        ]);
        if (live) {
          setArchive(a);
          setWatch(w);
        }
      } catch {
        if (live) setMessage(tr('unavailable'));
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  async function run(action: ArchiveAction) {
    setPicking(true);
    setMessage('');
    try {
      setArchive(await window.thingSorted.archive(action));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : tr('error'),
      );
    } finally {
      setPicking(false);
    }
  }
  async function changeWatch(action: WatchAction) {
    setPicking(true);
    setMessage('');
    try {
      setWatch(await window.thingSorted.watch(action));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : tr('error'),
      );
    } finally {
      setPicking(false);
    }
  }
  const working = archive.state === 'running';
  return (
    <div className="maintenance-settings">
      <section aria-label={tr('watch')}>
        <h3>{tr('watch')}</h3>
        <p>{tr('watchHelp')}</p>
        <div className="maintenance-status">
          <strong>{watch.folder ?? tr('off')}</strong>
          <span>
            {tr(
              {
                off: 'off',
                waiting: 'waiting',
                watching: 'watching',
                importing: 'copying',
                unavailable: 'unavailable',
              }[watch.state],
            )}
          </span>
        </div>
        <div className="settings-actions">
          <button
            className="secondary-button"
            disabled={picking || working}
            onClick={() => void changeWatch('choose')}
          >
            {tr('chooseWatch')}
          </button>
          {watch.enabled && (
            <button
              className="text-button"
              disabled={picking}
              onClick={() => void changeWatch('disable')}
            >
              {tr('disable')}
            </button>
          )}
        </div>
      </section>
      <section aria-label={tr('archiveTitle')}>
        <h3>{tr('archiveTitle')}</h3>
        <p>{tr('backupHelp')}</p>
        <p>{tr('restoreHelp')}</p>
        <div className="settings-actions">
          <button
            className="secondary-button"
            disabled={picking || working}
            onClick={() => void run('backup')}
          >
            {tr('backup')}
          </button>
          <button
            className="secondary-button"
            disabled={picking || working}
            onClick={() => void run('restore')}
          >
            {tr('restore')}
          </button>
        </div>
        {archive.state !== 'idle' && (
          <div className="archive-progress" role="status">
            <strong>
              {tr(archive.kind === 'backup' ? 'backup' : 'restore')} ·{' '}
              {tr(
                {
                  running: 'working',
                  complete: 'complete',
                  failed: 'unavailable',
                  cancelled: 'cancelled',
                  interrupted: 'waiting',
                  idle: 'off',
                }[archive.state],
              )}
            </strong>
            <progress value={archive.done} max={Math.max(1, archive.total)} />
            <span>
              {archive.done.toLocaleString(language())} / {archive.total.toLocaleString(language())}
            </span>
            {archive.message && <p>{archive.message}</p>}
            {working ? (
              <button className="text-button" onClick={() => void run('cancel')}>
                {tr('cancel')}
              </button>
            ) : ['failed', 'cancelled', 'interrupted'].includes(archive.state) ? (
              <button className="secondary-button" onClick={() => void run('resume')}>
                {tr('resume')}
              </button>
            ) : null}
          </div>
        )}
      </section>
      {message && (
        <p className="inline-message" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
