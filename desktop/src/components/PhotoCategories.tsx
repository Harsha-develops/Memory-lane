import { useEffect, useState } from 'react';
import { CategoryReview } from './CategoryReview';
export function PhotoCategories({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const [name, setName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([
      window.thingSorted.catalog('detail', { id }),
      window.thingSorted.catalog('personNames', {}),
    ])
      .then(([p, labels]) => {
        if (live) {
          setTags(p.tags ?? []);
          setReference(p.personReference ?? '');
          setName(labels[p.personReference ?? ''] ?? '');
          setNames(labels);
        }
      })
      .catch(() => {
        if (live) setMessage('Albums could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, [id, revision]);
  async function saveName() {
    setBusy(true);
    try {
      const label = reference || (await window.thingSorted.catalog('newPerson', { id })).label;
      setReference(label);
      await window.thingSorted.catalog('renamePerson', { label, name: name.trim() });
      setRevision((v) => v + 1);
      setMessage('Name saved. AI will use this portrait as the reference.');
      onChanged();
    } catch {
      setMessage(
        'Could not save this person. Use a name up to 80 characters; up to eight references are supported.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await window.thingSorted.catalog('removePerson', { id });
      setReference('');
      setName('');
      setMessage('Reference removed. Existing albums remain.');
    } catch {
      setMessage('The reference could not be removed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="photo-categories">
      <h3>AI albums</h3>
      <p>{tags.length ? tags.map((t) => names[t] ?? t).join(' · ') : 'Not classified yet'}</p>
      <button className="secondary-button" onClick={() => setReview(true)}>
        AI categorize photo
      </button>
      <h4>Name this person</h4>
      <p className="viewer-note">
        Use a clear portrait with one person. You supply the name; AI finds matching photos when you
        enable people sorting.
      </p>
      <label className="field-label">
        Person name
        <input
          aria-label="Person name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
        />
      </label>
      <button
        className="secondary-button"
        disabled={busy || !name.trim()}
        onClick={() => void saveName()}
      >
        {reference ? 'Save person name' : 'Name person & use reference'}
      </button>
      {reference && (
        <button className="text-button" disabled={busy} onClick={() => void remove()}>
          Remove person reference
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {review && (
        <CategoryReview
          ids={[id]}
          onClose={() => setReview(false)}
          onChanged={() => {
            setRevision((v) => v + 1);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
