// The app: top bar, pieces panel, sheets and properties, with the dialogs
// loaded when first needed.

import { useEffect, useRef, type DragEvent } from 'react';
import { LEFT_DRAWER_QUERY, NARROW_QUERY } from './config.ts';
import { t } from './copy/index.ts';
import { Dock, Rail } from './components/canvas/Dock.tsx';
import { PieceToolbar } from './components/canvas/PieceToolbar.tsx';
import { Stage } from './components/canvas/Stage.tsx';
import { Dialogs } from './components/dialogs/Dialogs.tsx';
import { preloadDialogs } from './components/dialogs/lazy.ts';
import { LiveRegions } from './components/feedback/LiveRegions.tsx';
import { NoticePill } from './components/feedback/NoticePill.tsx';
import { Tooltip } from './components/feedback/Tooltip.tsx';
import { PiecesPanel } from './components/pieces-panel/PiecesPanel.tsx';
import { PropertiesPanel } from './components/properties-panel/PropertiesPanel.tsx';
import { Topbar } from './components/topbar/Topbar.tsx';
import { useFocusRescue } from './hooks/useFocusRescue.ts';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts.ts';
import { stepTexts } from './services/measure.ts';
import { usePrefs } from './state/prefs.ts';
import { getView, setView, useView } from './state/view.ts';
import { closeDrawer, DRAWER_PANELS, DRAWER_TRIGGERS, isDrawerOpen } from './state/actions/drawers.ts';
import { filesFrom, loadFiles } from './state/actions/files.ts';
import { focusSheet } from './state/actions/focus.ts';
import { startProjects } from './state/actions/projects.ts';
import { setSelection } from './state/actions/selection.ts';

function PieceHint() {
  const singleKeys = usePrefs((s) => s.singleKeys);
  usePrefs((s) => s.unit);
  return (
    <p id="piece-hint" className="sr-only">
      {t(singleKeys ? 'piecebar.hint' : 'piecebar.hintNoKeys', stepTexts())}
    </p>
  );
}

function FocusRescue() {
  useFocusRescue();
  return null;
}

/**
 * Files dropped on the workspace (on a sheet: starting with that sheet). The
 * drop target state is a class set right away, like the drag events come.
 */
function useDropZone() {
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const mark = (e: DragEvent, on: boolean) => e.currentTarget.classList.toggle('is-drop-target', on);
  return {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      mark(e, true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) mark(e, false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      mark(e, false);
      const page = (e.target as Element).closest?.<HTMLElement>('.page');
      if (page) {
        setView({ sheet: Number(page.dataset.sheet) });
        setSelection([]);
      }
      void loadFiles(filesFrom(e.dataTransfer));
    },
  };
}

export function App() {
  const loading = useView((s) => s.loading);
  const singleKeys = usePrefs((s) => s.singleKeys);
  const drop = useDropZone();
  useGlobalShortcuts();

  useEffect(() => {
    document.body.classList.toggle('is-loading', loading);
  }, [loading]);
  useEffect(() => {
    document.body.classList.toggle('single-keys-off', !singleKeys);
  }, [singleKeys]);

  useEffect(() => {
    // Outside React's commit: the restore may move the focus right away.
    queueMicrotask(() => void startProjects());
    // Dropping a file outside the zone must not open it in the tab.
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    const paste = (e: ClipboardEvent) => {
      const files = filesFrom(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void loadFiles(files);
    };
    document.addEventListener('paste', paste);
    // A click outside an open overlay panel closes it.
    const outside = (e: PointerEvent) => {
      const name = getView().drawer;
      if (!name || !isDrawerOpen(name)) return;
      const target = e.target as Node;
      if (document.getElementById(DRAWER_PANELS[name])?.contains(target)) return;
      if (DRAWER_TRIGGERS[name].some((id) => document.getElementById(id)?.contains(target))) return;
      closeDrawer(name, { focus: 'auto' });
    };
    document.addEventListener('pointerdown', outside, true);
    // Crossing a breakpoint closes the panel that changes mode.
    const lists = [window.matchMedia(LEFT_DRAWER_QUERY), window.matchMedia(NARROW_QUERY)];
    const changed = () => {
      const name = getView().drawer;
      if (name) setView({ drawer: null });
    };
    for (const list of lists) list.addEventListener('change', changed);
    // The rarely used dialogs load when the app is idle.
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
    idle(preloadDialogs);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
      document.removeEventListener('paste', paste);
      document.removeEventListener('pointerdown', outside, true);
      for (const list of lists) list.removeEventListener('change', changed);
    };
  }, []);

  return (
    <>
      <a
        id="skip"
        className="skip-link"
        href="#sheets"
        onClick={(e) => {
          e.preventDefault();
          focusSheet();
        }}
      >
        {t('app.skip')}
      </a>
      <Topbar />
      <div id="workspace" className="workspace" {...drop}>
        <Rail />
        <PiecesPanel />
        <main id="canvas" className="canvas" aria-busy={loading ? 'true' : undefined}>
          <h1 className="sr-only">{t('app.heading')}</h1>
          <Stage />
          <PieceToolbar />
          <Dock />
          <NoticePill />
          <PieceHint />
          <LiveRegions />
          <Tooltip />
        </main>
        <PropertiesPanel />
      </div>
      <p className="print-only">{t('app.printOnly')}</p>
      <Dialogs />
      <FocusRescue />
    </>
  );
}
