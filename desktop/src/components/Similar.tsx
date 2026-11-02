import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import type { SimilarData } from '../../shared/catalog';
import type { Photo } from '../../shared/contracts';
import { PhotoImage, PhotoViewer } from './PhotoViewer';
export function Similar() {
  const [data, setData] = useState<SimilarData>({
    state: 'idle',
    processed: 0,
    total: 0,
    pairs: [],
  });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [message, setMessage] = useState('');
  async function refresh() {
    setData(await window.thingSorted.catalog('similar', {}));
  }
  useEffect(() => {
    void refresh().catch(() => setMessage(tr('Review could not be loaded.')));
    const timer = setInterval(
      () => void refresh().catch(() => setMessage('The local connection is unavailable.')),
      1500,
    );
    return () => clearInterval(timer);
  }, []);
  async function scan() {
    try {
      setData(await window.thingSorted.catalog('scanSimilar', {}));
      setMessage('');
    } catch {
      setMessage(tr('The scan could not start. Please try again.'));
    }
  }
  async function review(id: string, decision: 'keep' | 'similar') {
    try {
      await window.thingSorted.catalog('reviewSimilar', { id, decision });
      await refresh();
      setMessage(tr('Decision saved. Both originals are kept.'));
    } catch {
      setMessage(tr('The decision could not be saved.'));
    }
  }
  return (
    <section className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr('A LITTLE LESS DOUBLE-TAKE')}</div>
          <h1>{tr('Some moments look familiar.')}</h1>
          <p className="library-subtitle">
            {tr('Exact copies are caught during import. You decide about lookalikes.')}
          </p>
        </div>
        <button
          className="primary-button"
          disabled={data.state === 'running'}
          onClick={() => void scan()}
        >
          {data.state === 'running' ? tr('Comparing previews\u2026') : tr('Find similar photos')}
        </button>
      </div>
      <div className="review-explainer">
        <strong>{tr('Optional. Local. Always your call.')}</strong>
        <p>
          {tr(
            'This compares the light and dark patterns of small previews. Suggestions can be wrong, especially with simple scenes. Review up to 200 pairs at a time. Neither choice deletes a photo.',
          )}
        </p>
      </div>
      {data.state === 'running' && (
        <div className="scan-progress">
          <progress value={data.processed} max={Math.max(1, data.total)} />
          <span>
            {data.processed} of {data.total} compared
          </span>
        </div>
      )}
      {['failed', 'interrupted'].includes(data.state) && (
        <p role="alert">
          {tr('The scan stopped. Saved decisions are safe; use Find similar photos to try again.')}
        </p>
      )}
      {message && (
        <p className="inline-message" role="status">
          {message}
        </p>
      )}
      {!data.pairs.length && data.state !== 'running' && (
        <div className="library-empty">
          <h2>
            {data.state === 'idle'
              ? tr('A fresh pair of eyes, on your terms.')
              : tr('Nothing waiting for a second look.')}
          </h2>
          <p>
            {data.state === 'idle'
              ? tr('Start a comparison whenever you want.')
              : tr(
                  'No unreviewed suggestions in this pass. The scan is approximate, so it may miss lookalikes.',
                )}
          </p>
        </div>
      )}
      <div className="similar-grid">
        {data.pairs.map((pair) => (
          <article className="similar-pair" key={pair.id}>
            <div className="pair-photos">
              {[pair.first, pair.second].map((item) => (
                <button
                  key={item.id}
                  aria-label={`Preview ${item.name}`}
                  onClick={() => setPhoto(item)}
                >
                  <PhotoImage photo={item} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <div className="pair-actions">
              <span>{tr('Suggested match \u00B7 review both')}</span>
              <button className="secondary-button" onClick={() => void review(pair.id, 'keep')}>
                {tr('Keep both')}
              </button>
              <button className="primary-button" onClick={() => void review(pair.id, 'similar')}>
                {tr('Mark as similar')}
              </button>
            </div>
          </article>
        ))}
      </div>
      <PhotoViewer photo={photo} onClose={() => setPhoto(null)} />
    </section>
  );
}
