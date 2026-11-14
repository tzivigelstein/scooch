// Every language's texts at once, for what runs at build time (static.ts) and
// for the tests. Never imported by the app, which loads only the language it
// shows (load.ts).

import type { Language } from '../core/language.js';
import es from './es.ts';
import type { Catalogue } from './index.ts';

export const CATALOGUES: Readonly<Record<Language, Catalogue>> = { es };
