const paths = {
  orbit: 'M21 12a9 9 0 1 1-9-9M12 8a4 4 0 1 0 4 4M19 2v6M16 5h6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  folder: 'M3 7V5h6l2 2h10v13H3z',
  layers: 'm12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  close: 'm6 6 12 12M6 18 18 6',
  image: 'M3 3h18v18H3zM3 17l6-7 4 5 3-3 5 6M15 7h.01',
} as const;

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
