// The selection frames on the sheets: #frame (with its handle) for one piece,
// one frame per sheet for several. React renders the elements; their
// positions depend on the measured layout and are painted after each render
// and, during a gesture, from its live values.

import { useEffect, useLayoutEffect } from 'react';
import { useDocument } from '../../state/document.ts';
import { gestureStore } from '../../state/gesture.ts';
import { usePrefs } from '../../state/prefs.ts';
import { useView } from '../../state/view.ts';
import { useCurrentNotice } from '../feedback/NoticePill.tsx';
import { groupFrames, paintCommittedSelection, paintSelection } from './selection.ts';
import './SelectionOverlay.css';

export function SelectionOverlay({ layout }: { layout: number }) {
  const items = useDocument((s) => s.items);
  const selection = useDocument((s) => s.selection);
  const sheets = useDocument((s) => s.sheets);
  const zoom = useView((s) => s.zoom);
  const drawer = useView((s) => s.drawer);
  const unit = usePrefs((s) => s.unit);
  const cuts = useDocument((s) => s.cuts);
  // The notice floats over the canvas: when it shows up, goes or changes, the
  // toolbar moves off it. Not only an action's result: a problem notice waits
  // while a measure is typed and shows up when it is confirmed, with no other
  // change to the document.
  const notice = useCurrentNotice();
  const noticeShown = notice ? [notice.text, notice.action?.label ?? '', !!notice.flash].join('|') : '';

  // One frame per sheet with selected pieces (only with several selected),
  // known by what it frames, the first of them: when they all go to another
  // sheet together (Arrange, Undo), it goes along with them.
  const frames = selection.length > 1 ? groupFrames(items, selection) : [];

  useLayoutEffect(() => {
    // During a gesture its live values are painted (below); a notice that comes or goes meanwhile waits for its end.
    if (gestureStore.getState().drafts) return;
    paintCommittedSelection();
  }, [items, selection, sheets, zoom, drawer, layout, unit, cuts, noticeShown]);

  // Live values during a gesture; when it ends, back to the document.
  useEffect(
    () =>
      gestureStore.subscribe((state, previous) => {
        if (state.drafts === previous.drafts) return;
        if (state.drafts) paintSelection(state.drafts, { place: false });
        else paintCommittedSelection();
      }),
    []
  );

  return (
    <>
      {frames.map(({ piece, sheet }) => (
        <div key={piece} className="group-frame" data-piece={piece} aria-hidden="true">
          <span className="handle" data-sheet={sheet} />
        </div>
      ))}
      <div id="frame" className="frame" aria-hidden="true" hidden>
        <span id="handle" className="handle" />
      </div>
    </>
  );
}
