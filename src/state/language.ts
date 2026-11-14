// The language whose texts are on screen (services/language.ts sets it once
// they are installed). The app's root reads it, so a new language renders
// everything again; so do the memoized components, which would skip that
// render otherwise. Not a setting: what the person chooses is prefs.language.

import { create } from 'zustand';
import type { Language } from '../core/language.js';

export const useLanguage = create<{ language: Language | null }>()(() => ({ language: null }));

/** Re-renders the component when the interface's language changes. */
export const useTextsLanguage = () => useLanguage((s) => s.language);
