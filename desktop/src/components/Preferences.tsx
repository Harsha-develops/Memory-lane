import { tr } from '../i18n';
import { MaintenanceSettings } from './MaintenanceSettings';
import { useEffect, useRef } from 'react';
import { PrivacySettings } from './PrivacySettings';
import { Icon } from './Icon';
export interface PreferencesValue {
  theme: 'dark' | 'light';
  motion: boolean;
  menuPosition: 'left' | 'top';
}
export function Preferences({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: PreferencesValue;
  onChange: (value: PreferencesValue) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="preferences"
      onCancel={onClose}
      aria-labelledby="settings-title"
    >
      <div className="dialog-heading">
        <h2 id="settings-title">{tr('Make yourself at home.')}</h2>
        <button className="icon-button" aria-label={tr('Close preferences')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">{tr('Your space, your pace.')}</p>
      <label className="setting">
        <span>
          {tr('Appearance')}
          <small>{tr('Choose a comfortable backdrop.')}</small>
        </span>
        <select
          value={value.theme}
          onChange={(e) => onChange({ ...value, theme: e.target.value as 'dark' | 'light' })}
        >
          <option value="dark">{tr('Dark')}</option>
          <option value="light">{tr('Light')}</option>
        </select>
      </label>
      <label className="setting">
        <span>
          {tr('Animated moments')}
          <small>{tr('System reduced-motion settings always take priority.')}</small>
        </span>
        <input
          type="checkbox"
          checked={value.motion}
          onChange={(e) => onChange({ ...value, motion: e.target.checked })}
        />
      </label>
      <label className="setting">
        <span>
          Menu Position<small>Keep navigation at the top or on the left.</small>
        </span>
        <select
          aria-label="Menu position"
          value={value.menuPosition}
          onChange={(e) => onChange({ ...value, menuPosition: e.target.value as 'top' | 'left' })}
        >
          <option value="top">Top</option>
          <option value="left">Left</option>
        </select>
      </label>
      <div className="setting">
        <span>Language</span>
        <span>English</span>
      </div>
      {open && <PrivacySettings />}
      {open && <MaintenanceSettings />}
      <div className="privacy-note">
        <Icon name="lock" />
        <p>
          {tr(
            'Your photos stay on your computer. Optional AI sends notes or selected previews to your own provider only with your permission.',
          )}
        </p>
      </div>
      <button className="primary-button" onClick={onClose}>
        {tr('All set')}
        <Icon name="check" />
      </button>
    </dialog>
  );
}
