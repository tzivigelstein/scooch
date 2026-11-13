// Copy, cut and paste: pieces inside the tab (state/actions/clipboard.ts) and
// image or PDF files from the system clipboard. Copying pieces also writes a
// line of text to the system clipboard, so whatever is copied later outside
// replaces it: on paste, files there are newer than our pieces. Inside text
// fields and dialogs the browser keeps its own copy and paste.

import { useEffect } from 'react';
import { t } from '../copy/index.ts';
import { getDocument } from '../state/document.ts';
import { CLIP_TYPE, copySelection, cutSelection, hasClip, pastePieces } from '../state/actions/clipboard.ts';
import { filesFrom, loadFiles } from '../state/actions/files.ts';
import { isTyping } from './dom.ts';

// The page's own: not while typing, in a dialog or with text selected (copying that text).
function ours() {
  const active = document.activeElement;
  if (isTyping(active) || active?.closest('dialog')) return false;
  const selection = window.getSelection();
  return !selection || selection.isCollapsed;
}

function writeMarker(e: ClipboardEvent, n: number) {
  e.clipboardData?.setData('text/plain', t('announce.copiedText', { n }));
  e.clipboardData?.setData(CLIP_TYPE, String(Date.now()));
}

function onCopy(e: ClipboardEvent) {
  const n = getDocument().selection.length;
  if (!n || !ours()) return;
  e.preventDefault();
  writeMarker(e, n);
  copySelection();
}

function onCut(e: ClipboardEvent) {
  const n = getDocument().selection.length;
  if (!n || !ours() || getDocument().busy) return;
  e.preventDefault();
  writeMarker(e, n);
  cutSelection();
}

function onPaste(e: ClipboardEvent) {
  if (!ours()) return;
  const files = filesFrom(e.clipboardData);
  if (files.length) {
    e.preventDefault();
    void loadFiles(files);
  } else if (hasClip()) {
    e.preventDefault();
    pastePieces();
  }
}

export function useClipboard() {
  useEffect(() => {
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}
