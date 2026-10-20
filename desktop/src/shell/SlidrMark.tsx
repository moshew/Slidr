import { useId } from 'react';

/** The spark, a four-pointed star around (25.5, 11) on the mark's 32 grid. */
const SPARK =
  'M25.5 5.5Q26.38 10.12 31 11Q26.38 11.88 25.5 16.5Q24.62 11.88 20 11Q24.62 10.12 25.5 5.5Z';

/**
 * The Slidr mark, drawn for the header's colours: a slide stepping forward from the one behind
 * it, with a spark breaking out of its corner — an idea taking the stage. The slides are cut
 * around the spark, so it stands clear of them on any of the header's colours.
 * `public/favicon.svg` is the same mark on a tile of the header's gradient.
 */
export function SlidrMark({ className }: { className?: string }) {
  // An id of React's own holds colons, which a `url(#…)` cannot.
  const cut = `mark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="white" />
        <path d={SPARK} stroke="black" strokeWidth="2.4" strokeLinejoin="round" />
      </mask>
      <g mask={`url(#${cut})`}>
        <rect x="3" y="6" width="18" height="13" rx="2.5" className="fill-ui-header-fg/50" />
        <rect x="7" y="12" width="20" height="14" rx="3" className="fill-ui-header-fg" />
        <rect x="10" y="16" width="9" height="2.5" rx="1.25" className="fill-ui-header-middle" />
        <rect x="10" y="20.5" width="6" height="2" rx="1" className="fill-ui-header-middle/45" />
      </g>
      <path d={SPARK} className="fill-ui-header-spark" />
    </svg>
  );
}
