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
import { paintCommittedSelection, paintSelection } from './selection.ts';
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

  // One frame per sheet with selected pieces (only with several selected).
  const frameSheets =
    selection.length > 1
      ? sheets.map((sheet) => sheet.id).filter((id) => items.some((item) => item.sheet === id && selection.includes(item.id)))
      : [];

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
      {frameSheets.map((id) => (
        <div key={id} className="group-frame" aria-hidden="true">
          <span className="handle" data-sheet={id} />
        </div>
      ))}
      <div id="frame" className="frame" aria-hidden="true" hidden>
        <span id="handle" className="handle" />
      </div>
    </>
  );
}
