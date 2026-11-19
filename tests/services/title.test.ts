// @vitest-environment jsdom
// The tab's title (src/services/title.ts) on the real stores: the app's own
// title while the open project is empty, the project's name and the app's
// once it has pieces, following a rename and the language.
import { afterEach, beforeEach, expect, test } from 'vitest';
import en from '../../src/copy/en.ts';
import es from '../../src/copy/es.ts';
import { applyTexts } from '../../src/services/language.ts';
import { followTitle, showTitle } from '../../src/services/title.ts';
import { setDocument } from '../../src/state/document.ts';
import { useProject } from '../../src/state/project.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

let stop: () => void;

beforeEach(() => {
  resetState();
  useProject.setState({ id: 'p1', name: 'Tarjetas', status: 'saved', storage: true });
  stop = followTitle();
  showTitle();
});

afterEach(() => {
  stop();
  applyTexts('es', es);
});

test('an empty project keeps the app’s title; with pieces, the tab says the project’s name and the app’s', () => {
  expect(document.title).toBe('Scooch — Acomoda imágenes y PDF en una hoja a tamaño real');
  setDocument({ items: [piece(1, fakeImageMm(40, 30), 10, 10)] });
  expect(document.title).toBe('Tarjetas — Scooch');
  setDocument({ items: [] });
  expect(document.title).toBe('Scooch — Acomoda imágenes y PDF en una hoja a tamaño real');
});

test('a rename shows at once, and another language changes the app’s title, never the name', () => {
  setDocument({ items: [piece(1, fakeImageMm(40, 30), 10, 10)] });
  useProject.setState({ name: 'Fotos carnet' });
  expect(document.title).toBe('Fotos carnet — Scooch');
  applyTexts('en', en);
  expect(document.title).toBe('Fotos carnet — Scooch');
  setDocument({ items: [] });
  expect(document.title).toBe(en.app.title.replace('{app}', 'Scooch'));
});
