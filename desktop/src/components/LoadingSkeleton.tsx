export function LoadingSkeleton({
  label = 'Loading Your Memories',
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={`loading-skeleton ${compact ? 'compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p>{label}…</p>
      <div className="skeleton-heading skeleton-block" aria-hidden="true" />
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: compact ? 2 : 6 }, (_, i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton-photo skeleton-block" />
            <div className="skeleton-line skeleton-block" />
          </div>
        ))}
      </div>
    </section>
  );
}
