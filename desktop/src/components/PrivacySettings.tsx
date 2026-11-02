import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import type { Privacy } from '../../shared/catalog';
export function PrivacySettings() {
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void window.thingSorted
      .catalog('privacy', {})
      .then(setPrivacy)
      .catch(() =>
        setMessage(tr('Location settings are unavailable until the local connection is ready.')),
      );
  }, []);
  async function save(value: Privacy) {
    const previous = privacy;
    setPrivacy(value);
    setSaving(true);
    try {
      setPrivacy(await window.thingSorted.catalog('setPrivacy', value));
      setMessage(tr('Location preference saved.'));
    } catch {
      setPrivacy(previous);
      setMessage(tr('This preference could not be saved.'));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {privacy && (
        <>
          <label className="setting">
            <span>
              {tr('Show photo locations')}
              <small>{tr('Display recorded coordinates in photo details.')}</small>
            </span>
            <input
              type="checkbox"
              disabled={saving}
              checked={privacy.showGps}
              onChange={(event) => void save({ ...privacy, showGps: event.target.checked })}
            />
          </label>
          <label className="setting">
            <span>
              {tr('Keep location metadata')}
              <small>{tr('Save EXIF coordinates for future imports, locally.')}</small>
            </span>
            <input
              type="checkbox"
              disabled={saving}
              checked={privacy.storeGps}
              onChange={(event) => void save({ ...privacy, storeGps: event.target.checked })}
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
              void window.thingSorted
                .catalog('forgetLocations', {})
                .then(setPrivacy)
                .catch(() => setMessage(tr('The action was cancelled or could not be completed.')));
            }}
          >
            {tr('Forget stored locations')}
          </button>
          <p className="viewer-note">
            {tr(
              'Original files retain their metadata. Existing catalog backups may still contain earlier coordinates.',
            )}
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}
