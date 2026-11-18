// The languages the site has content in, Spanish first (the reference). A
// language is a folder of its own here (docs/site.md, «Adding a language»)
// registered in this list; a page exists in it only if its folder has it.

import type { SiteLanguage } from '../types.ts';
import { en } from './en/index.ts';
import { es } from './es/index.ts';
import { fr } from './fr/index.ts';

export const SITE_LANGUAGES: readonly SiteLanguage[] = Object.freeze([es, en, fr]);
