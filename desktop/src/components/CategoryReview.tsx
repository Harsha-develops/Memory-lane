import { useEffect, useRef, useState } from 'react';
import { categories } from '../../shared/categories';
import { Icon } from './Icon';
type Row = { id: string; name: string; tags: string[]; error?: string };
export function CategoryReview({
  ids,
  onClose,
  onChanged,
}: {
  ids: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stop = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [people, setPeople] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([...categories]);
  const [provider, setProvider] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    let live = true;
    void Promise.all([
      window.thingSorted.ai('status', null),
      window.thingSorted.catalog('people', {}),
      window.thingSorted.catalog('personNames', {}),
    ])
      .then(([status, refs, labels]) => {
        if (!live) return;
        setProvider(status.configured ? new URL(status.endpoint).origin : '');
        setReferenceCount(refs.length);
        setNames(labels);
      })
      .catch(() => {
        if (live) setMessage('Provider settings could not be loaded.');
      });
    return () => {
      live = false;
      stop.current = true;
      void window.thingSorted.ai('cancel', null).catch(() => {});
      opener?.focus();
    };
  }, []);
  function changed() {
    setConsent(false);
    setRows([]);
    setMessage('');
  }
  async function analyze() {
    stop.current = false;
    setBusy(true);
    setMessage('');
    const completed = new Set(rows.filter((r) => !r.error).map((r) => r.id));
    for (const id of ids) {
      if (stop.current) break;
      if (completed.has(id)) continue;
      let name = 'Photo';
      try {
        const photo = await window.thingSorted.catalog('detail', { id });
        name = photo.name;
        if (stop.current) break;
        const result = await window.thingSorted.ai('analyze', {
          id,
          consent: true,
          people,
          categories: selected,
        });
        setRows((old) => [...old.filter((r) => r.id !== id), { id, name, tags: result.tags }]);
        onChanged();
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
            : 'Classification failed.';
        setRows((old) => [...old.filter((r) => r.id !== id), { id, name, tags: [], error: text }]);
        setMessage(
          'Sorting stopped. Completed photos are already in their albums. Check API key settings before continuing.',
        );
        break;
      }
    }
    setBusy(false);
    setConsent(false);
  }
  const done = rows.filter((r) => !r.error).length;
  return (
    <dialog
      ref={dialog}
      className="preferences category-review"
      aria-labelledby="categorize-title"
      onCancel={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">Choose Categories. We Sort.</div>
          <h2 id="categorize-title">AI album sorting.</h2>
        </div>
        <button className="icon-button" aria-label="Close categorization" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">
        Choose the categories you want. AI classifies each photo and adds it to every matching album
        automatically. No manual labels or save step.
      </p>
      <div className="ai-state">
        Selected photos: {ids.length} · {provider || 'Set up your API key in the sidebar first'}
      </div>
      <fieldset className="category-choices" disabled={busy}>
        <legend>Albums to sort into</legend>
        <div className="settings-actions">
          <button
            className="text-button"
            onClick={() => {
              setSelected([...categories]);
              changed();
            }}
          >
            Select all categories
          </button>
          <button
            className="text-button"
            onClick={() => {
              setSelected([]);
              changed();
            }}
          >
            Clear categories
          </button>
        </div>
        <div className="category-choice-grid">
          {categories.map((label) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={selected.includes(label)}
                onChange={(e) => {
                  setSelected((old) =>
                    e.target.checked ? [...old, label] : old.filter((c) => c !== label),
                  );
                  changed();
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="ai-consent">
        <input
          type="checkbox"
          disabled={busy || !referenceCount}
          checked={people}
          onChange={(e) => {
            setPeople(e.target.checked);
            changed();
          }}
        />
        Also sort into my named people albums ({referenceCount} references)
      </label>
      <p className="viewer-note">
        Name a person from a clear single-person photo in the viewer. AI uses that reference for
        matching; uncertain matches can be missed. Names stay on your computer. You can rename an
        existing person there.
      </p>
      <p className="viewer-note">
        Resized previews go to your vision provider. Originals, filenames, GPS and EXIF are not
        attached. Image content itself may reveal people or places. Person comparisons may use
        several requests per photo; Groq receives at most two references with each target. Provider
        charges and data policies apply.
      </p>
      <label className="ai-consent">
        <input
          type="checkbox"
          disabled={busy}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Send these selected previews{people ? ' and person references' : ''} and sort into albums
        automatically
      </label>
      <div className="settings-actions">
        <button
          className="primary-button"
          disabled={
            busy || !consent || !provider || (!selected.length && !people) || done === ids.length
          }
          onClick={() => void analyze()}
        >
          <Icon name="spark" />
          {done ? 'Continue sorting' : 'Classify & create albums'}
        </button>
        {busy && (
          <button
            className="text-button"
            onClick={() => {
              stop.current = true;
              void window.thingSorted.ai('cancel', null).catch(() => {});
              setMessage('Stopping. Completed photos stay organized.');
            }}
          >
            Stop
          </button>
        )}
      </div>
      <p role="status">
        {done} / {ids.length} sorted{busy ? ' · Working…' : ''}
      </p>
      <div className="category-results">
        {rows.map((row) => (
          <article key={row.id}>
            <img src={`thing://app/photos/${row.id}/thumbnail`} alt={row.name} />
            <div>
              <strong>{row.name}</strong>
              {row.error ? (
                <p role="alert">{row.error}</p>
              ) : (
                <>
                  <p>
                    {row.tags.length
                      ? row.tags.map((t) => names[t] ?? t).join(' · ')
                      : 'No confident match in the chosen categories.'}
                  </p>
                  <small>{row.tags.length ? 'Added to matching albums' : 'Left unassigned'}</small>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {done > 0 && (
        <p className="viewer-note">
          Open Trips & albums to see the automatically organized albums. A photo can belong to
          several albums; existing trips and original files stay unchanged.
        </p>
      )}
      {message && (
        <p className="inline-message" role="status">
          {message}
        </p>
      )}
    </dialog>
  );
}
