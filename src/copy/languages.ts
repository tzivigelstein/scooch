// Each interface language by its own name, as «Idioma» lists them: the same
// in every language, so anyone finds theirs.

import type { Language } from '../core/language.js';

export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = Object.freeze({
  es: 'Español',
  en: 'English',
});
