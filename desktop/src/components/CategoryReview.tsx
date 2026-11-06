import { useEffect, useRef, useState } from 'react';
import { categories } from '../../shared/categories';
import { Icon } from './Icon';

type Row = {
  id: string;
  name: string;
  tags: string[];
  destination: string;
  already: boolean;
  organized: string;
  folder?: string;
  error?: string;
  moveError?: string;
};
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
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState('');
  const [consent, setConsent] = useState(false);
  const [people, setPeople] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([...categories]);
  const [available, setAvailable] = useState<string[]>([...categories]);
  const [discover, setDiscover] = useState(true);
  const [otherName, setOtherName] = useState('Others');
  const [provider, setProvider] = useState('');
  const [message, setMessage] = useState('');
  function preferred(tags: string[], labels: Record<string, string>) {
    return tags.find((tag) => /^person /.test(tag) && labels[tag]) ?? tags[0] ?? 'others';
  }
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    let live = true;
    void Promise.all([
      window.thingSorted.ai('status', null),
      window.thingSorted.catalog('people', {}),
      window.thingSorted.catalog('personNames', {}),
      window.thingSorted.catalog('categoryNames', {}),
      Promise.all(ids.map((id) => window.thingSorted.catalog('detail', { id }))),
    ])
      .then(([status, refs, peopleNames, categoryNames, photos]) => {
        const labels = { ...categoryNames, ...peopleNames };
        if (!live) return;
        setProvider(status.configured ? new URL(status.endpoint).origin : '');
        setReferenceCount(refs.length);
        setNames(labels);
        setOtherName(categoryNames.others ?? 'Others');
        const choices = [...new Set([...categories, ...Object.keys(categoryNames)])];
        setAvailable(choices);
        setSelected(choices.slice(0, 55));
        setRows(
          photos
            .filter((p) => p.categorized)
            .map((p) => ({
              id: p.id,
              name: p.name,
              tags: p.tags ?? [],
              destination: p.organizedLabel || preferred(p.tags ?? [], labels),
              already: true,
              organized: p.organizedLabel ?? '',
            })),
        );
      })
      .catch(() => {
        if (live)
          setMessage('Photo or provider settings could not be loaded. Reopen this panel to retry.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      stop.current = true;
      void window.thingSorted.ai('cancel', null).catch(() => {});
      opener?.focus();
    };
  }, []);
  const done = rows.filter((r) => !r.error).length;
  function update(row: Row) {
    setRows((old) => [...old.filter((r) => r.id !== row.id), row]);
  }
  function changed() {
    setConsent(false);
    setMessage('');
  }
  function errorText(error: unknown) {
    return error instanceof Error
      ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
      : 'Please try again.';
  }
  async function movePhoto(row: Row) {
    setMoving(row.id);
    try {
      const result = await window.thingSorted.catalog('organize', {
        id: row.id,
        label: row.destination,
      });
      update({ ...row, organized: result.label, folder: result.folder, moveError: undefined });
      onChanged();
    } catch (error) {
      update({ ...row, moveError: errorText(error) });
    } finally {
      setMoving('');
    }
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
        const result = photo.categorized
          ? { tags: photo.tags ?? [], alreadyCategorized: true }
          : await window.thingSorted.ai('analyze', {
              id,
              consent: true,
              people,
              categories: selected,
              discover,
            });
        const row: Row = {
          id,
          name,
          tags: result.tags,
          destination:
            result.organizedLabel || photo.organizedLabel || preferred(result.tags, names),
          already: !!result.alreadyCategorized,
          organized: result.organizedLabel ?? photo.organizedLabel ?? '',
          moveError: result.organizationError,
        };
        update(row);
        onChanged();
        if (!row.organized && row.tags.length <= 1 && !stop.current) await movePhoto(row);
      } catch (error) {
        update({
          id,
          name,
          tags: [],
          destination: '',
          already: false,
          organized: '',
          error: errorText(error),
        });
        setMessage(
          'Classification stopped. Completed photos stay categorised and will be skipped next time.',
        );
        break;
      }
    }
    setBusy(false);
    setConsent(false);
  }
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
          <div className="eyebrow">Categorise Once. Organise With Care.</div>
          <h2 id="categorize-title">Categorise & Organise</h2>
        </div>
        <button className="icon-button" aria-label="Close categorization" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">
        Already categorised photos are skipped. Imported copies move into folders inside your Memory
        Lane library; your source files stay untouched. Every result gets a folder automatically.
        For multiple matches, you can change the destination below—named people are preferred.
      </p>
      <div className="ai-state">
        Selected: {ids.length} · Already categorised: {rows.filter((r) => r.already).length} ·{' '}
        {provider || 'Add your API key in the menu to classify new photos'}
      </div>
      <div className="settings-actions">
        <label className="field-label">
          Name For Others
          <input
            value={otherName}
            maxLength={40}
            disabled={busy}
            onChange={(e) => setOtherName(e.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          disabled={busy || !otherName.trim()}
          onClick={() => {
            setBusy(true);
            void window.thingSorted
              .catalog('renameCategory', { label: 'others', name: otherName })
              .then(() => {
                setNames((old) => ({ ...old, others: otherName.trim() }));
                changed();
                setMessage('Category Name Saved.');
                onChanged();
              })
              .catch((error) => setMessage(errorText(error)))
              .finally(() => setBusy(false));
          }}
        >
          Save Category Name
        </button>
      </div>
      <label className="ai-consent">
        <input
          type="checkbox"
          checked={discover}
          disabled={busy}
          onChange={(e) => {
            setDiscover(e.target.checked);
            changed();
          }}
        />
        Let AI Create A New Subject Category When Needed
      </label>
      <p className="viewer-note">
        Token Saver: compact previews, short JSON replies, and no repeat analysis. People matching
        sends extra reference images.
      </p>
      <fieldset className="category-choices" disabled={busy || loading}>
        <legend>Categories To Recognise (Up To 55)</legend>
        <div className="settings-actions">
          <button
            className="text-button"
            onClick={() => {
              setSelected(available.slice(0, 55));
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
          {available.map((label) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={selected.includes(label)}
                disabled={!selected.includes(label) && selected.length >= 55}
                onChange={(e) => {
                  setSelected((old) =>
                    e.target.checked ? [...old, label] : old.filter((c) => c !== label),
                  );
                  changed();
                }}
              />
              {names[label] ?? label}
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
        Names stay on your computer. Your provider receives resized previews and optional person
        references, without filenames, GPS or EXIF. Image content may reveal people or places;
        provider charges and data policies apply.
      </p>
      <label className="ai-consent">
        <input
          type="checkbox"
          disabled={busy || done === ids.length}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Send uncategorised previews{people ? ' and person references' : ''} to my provider and
        organise imported copies
      </label>
      <div className="settings-actions">
        <button
          className="primary-button"
          disabled={
            busy ||
            !!moving ||
            loading ||
            !consent ||
            !provider ||
            (!selected.length && !people && !discover) ||
            done === ids.length
          }
          onClick={() => void analyze()}
        >
          <Icon name="spark" />
          Classify & Organise
        </button>
        {busy && (
          <button
            className="text-button"
            onClick={() => {
              stop.current = true;
              void window.thingSorted.ai('cancel', null).catch(() => {});
            }}
          >
            Stop
          </button>
        )}
      </div>
      <p role="status">
        {loading
          ? 'Checking categorisation…'
          : `${done} / ${ids.length} categorised${busy ? ' · Working…' : ''}`}
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
                  <p className="categorized-state">
                    {row.already ? 'Already Categorised · Skipped' : 'Categorised'}
                  </p>
                  <p className="person-name">
                    {row.tags.map((t) => names[t] ?? t).join(' · ') ||
                      'No confident match—stored in Others'}
                  </p>
                  <label className="field-label">
                    Destination For {row.name}
                    <select
                      value={row.destination}
                      disabled={busy || !!moving}
                      onChange={(e) => update({ ...row, destination: e.target.value })}
                    >
                      {(row.tags.length ? row.tags : [row.organized || 'others']).map((tag) => (
                        <option key={tag} value={tag}>
                          {names[tag] ?? tag}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary-button"
                    disabled={busy || !!moving || row.organized === row.destination}
                    onClick={() => void movePhoto(row)}
                  >
                    {moving === row.id
                      ? 'Moving…'
                      : row.organized === row.destination
                        ? 'Organised'
                        : 'Move Photo Here'}
                  </button>
                  {row.organized && (
                    <small>
                      Stored In {names[row.organized] ?? row.organized}
                      {row.folder && <span className="folder-location">{row.folder}</span>}
                    </small>
                  )}
                  {row.moveError && <p role="alert">{row.moveError}</p>}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {message && (
        <p className="inline-message" role="status">
          {message}
        </p>
      )}
    </dialog>
  );
}
