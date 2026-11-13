import { memo } from 'react';

/**
 * The two live regions the announcer writes to. They exist from the first
 * render and never re-render: screen readers only follow regions already in
 * the page when their content changes.
 */
export const LiveRegions = memo(function LiveRegions() {
  return (
    <>
      <div id="live-polite" className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div id="live-assertive" className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" />
    </>
  );
});
