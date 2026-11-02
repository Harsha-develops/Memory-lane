import { useEffect, useRef, useState } from 'react';
import type { AiStatus, AiTask } from '../../shared/ai';
import { Icon } from './Icon';

export function AiPanel({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<AiStatus>({
    configured: false,
    endpoint: '',
    model: '',
    protocol: 'chat',
  });
  const [key, setKey] = useState('');
  const [notes, setNotes] = useState('');
  const [task, setTask] = useState<AiTask>('caption');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState('');
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    let live = true;
    dialog.current?.showModal();
    void window.thingSorted
      .ai('status', null)
      .then((value) => {
        if (live) setConfig(value);
      })
      .catch(() => {
        if (live) setMessage('Provider settings could not be read.');
      });
    return () => {
      live = false;
      void window.thingSorted.ai('cancel', null).catch(() => {});
      opener?.focus();
    };
  }, []);
  function error(value: unknown) {
    setMessage(
      value instanceof Error
        ? value.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
        : 'The AI request could not complete.',
    );
  }
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const saved = await window.thingSorted.ai('save', {
        endpoint: config.endpoint.trim(),
        model: config.model.trim(),
        protocol: config.protocol,
        key: key.trim(),
      });
      setConfig(saved);
      setKey('');
      setDirty(false);
      setConsent(false);
      setMessage(
        saved.configured
          ? 'Provider saved. No request has been sent.'
          : 'Provider setup cancelled.',
      );
    } catch (value) {
      error(value);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setMessage('');
    try {
      setConfig(await window.thingSorted.ai('remove', null));
      setKey('');
      setConsent(false);
      setDirty(false);
      setResult('');
      setMessage('Key removed. AI is off.');
    } catch (value) {
      error(value);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setRunning(true);
    setResult('');
    setMessage('');
    try {
      setResult((await window.thingSorted.ai('run', { task, notes, consent: true })).text);
    } catch (value) {
      error(value);
    } finally {
      setRunning(false);
      setConsent(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="preferences ai-panel"
      aria-labelledby="ai-title"
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">YOUR PROVIDER · YOUR CHOICE</div>
          <h2 id="ai-title">A little extra inspiration.</h2>
        </div>
        <button className="icon-button" aria-label="Close AI tools" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">
        Optional AI with your own API key. No built-in key, subscription, or model from thing
        sorted.
      </p>
      <div className="ai-state">
        {config.configured
          ? 'Your provider is configured'
          : 'AI is off — add your own key to begin'}
      </div>
      <fieldset disabled={busy || running} className="ai-form">
        <legend>API key & provider</legend>
        <button
          className="secondary-button"
          onClick={() => {
            setConfig({
              ...config,
              endpoint: 'https://api.groq.com/openai/v1/chat/completions',
              protocol: 'chat',
              model: 'qwen/qwen3.8-27b',
            });
            setDirty(true);
          }}
        >
          Use Groq vision settings
        </button>
        <p className="muted">
          For Groq photos, use a vision model. GPT-OSS 20B is text-only. A base URL ending in /v1 is
          expanded automatically.
        </p>
        <label>
          API format
          <select
            value={config.protocol}
            onChange={(e) => {
              setConfig({ ...config, protocol: e.target.value as AiStatus['protocol'] });
              setDirty(true);
            }}
          >
            <option value="chat">OpenAI-compatible Chat Completions</option>
            <option value="responses">OpenAI-compatible Responses</option>
          </select>
        </label>
        <label>
          API base URL or full endpoint
          <input
            type="url"
            autoComplete="off"
            value={config.endpoint}
            maxLength={500}
            placeholder="https://your-provider.example/v1/chat/completions"
            onChange={(e) => {
              setConfig({ ...config, endpoint: e.target.value });
              setDirty(true);
            }}
          />
        </label>
        <label>
          Model ID
          <input
            autoComplete="off"
            value={config.model}
            maxLength={150}
            placeholder="Your provider’s model ID"
            onChange={(e) => {
              setConfig({ ...config, model: e.target.value });
              setDirty(true);
            }}
          />
        </label>
        <label>
          Your API key
          <input
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={key}
            maxLength={2048}
            placeholder={
              config.configured
                ? 'Leave blank to keep the saved key for this provider'
                : 'Paste your own API key'
            }
            onChange={(e) => {
              setKey(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <p className="muted">
          Encrypted on this Windows account. Never included in photo backups or diagnostics. Use a
          provider supporting one of these API formats; a key alone is not enough.
        </p>
        <div className="settings-actions">
          <button
            className="secondary-button"
            onClick={() => void save()}
            disabled={
              (!key.trim() && !config.configured) || !config.endpoint.trim() || !config.model.trim()
            }
          >
            Save provider & key
          </button>
          {config.configured && (
            <button className="text-button" onClick={() => void remove()}>
              Remove key
            </button>
          )}
        </div>
      </fieldset>
      <button
        className="secondary-button"
        disabled={busy || running || dirty || !config.configured}
        onClick={async () => {
          setBusy(true);
          setMessage('Testing vision with a tiny sample image…');
          try {
            await window.thingSorted.ai('testVision', null);
            setMessage('Vision connection works. You can now classify photos.');
          } catch (value) {
            error(value);
          } finally {
            setBusy(false);
          }
        }}
      >
        Test vision connection (uses API credits)
      </button>
      <fieldset className="ai-form" disabled={busy || running}>
        <legend>Make something from your notes</legend>
        <label>
          AI task
          <select
            value={task}
            onChange={(e) => {
              setTask(e.target.value as AiTask);
              setConsent(false);
            }}
          >
            <option value="caption">Photo captions</option>
            <option value="tags">Organization tags</option>
            <option value="album">Album ideas</option>
          </select>
        </label>
        <label>
          Notes to send
          <textarea
            value={notes}
            maxLength={6000}
            rows={4}
            placeholder="Describe a moment, a trip, or a collection…"
            onChange={(e) => {
              setNotes(e.target.value);
              setConsent(false);
            }}
          />
        </label>
        <p className="muted">
          In this notes tool, only these notes and the selected task are sent. Photos, GPS, file
          names, and your catalog are not attached. Suggestions do not change your library.
        </p>
        <label className="ai-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Send these notes to my saved provider. Its billing and data policies apply.</span>
        </label>
        {dirty && <p className="muted">Save your provider changes before generating.</p>}
        <button
          className="primary-button"
          disabled={!config.configured || dirty || !consent || !notes.trim()}
          onClick={() => void run()}
        >
          <Icon name="spark" />
          Generate with my key
        </button>
      </fieldset>
      {running && (
        <div className="settings-actions" role="status">
          <span>Asking your provider…</span>
          <button
            className="text-button"
            onClick={() => {
              void window.thingSorted.ai('cancel', null).catch(error);
            }}
          >
            Cancel request
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="inline-message">
          {message}
        </p>
      )}
      {result && (
        <section className="ai-result" aria-label="AI suggestions">
          <h3>Your inspiration</h3>
          <p>{result}</p>
          <small>
            AI suggestions can be inaccurate. Review before using them. This result is cleared when
            you close this panel.
          </small>
        </section>
      )}
    </dialog>
  );
}
