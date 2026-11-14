// The languages of the interface and which one a browser gets on «Automático».
// Pure: the browser's languages are passed in (navigator.languages).

/** The interface languages, as BCP 47 tags (what `<html lang>` says). */
export const LANGUAGES = Object.freeze(['es']);

/** Is it one of LANGUAGES? */
export const isLanguage = (value) => LANGUAGES.includes(value);

/**
 * The language of `supported` that best fits the browser's languages (`tags`,
 * most preferred first): the first one we have, by its primary subtag
 * («es-AR» → es, «fr-CA» → fr). Chinese only in simplified script: «zh»,
 * «zh-CN», «zh-SG» and «zh-Hans-*» are zh-Hans; «zh-TW», «zh-HK», «zh-MO»
 * and «zh-Hant-*» are skipped, and so is a bare «zh» after one of those (that
 * browser means traditional). Hindi in Latin script («hi-Latn») is skipped
 * too. With no match, English (or the first supported, without English).
 *
 * Self-contained on purpose: index.html inlines its source to choose the
 * language before the first paint.
 */
export function matchLanguage(tags, supported) {
  const TRADITIONAL = ['hant', 'tw', 'hk', 'mo'];
  let traditional = false;
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== 'string') continue;
    const [primary, ...rest] = tag.toLowerCase().replace(/_/g, '-').split('-');
    let found = null;
    if (primary === 'zh') {
      const script = rest.find((part) => part === 'hans' || part === 'hant');
      const hant = script ? script === 'hant' : rest.some((part) => TRADITIONAL.includes(part)) || (rest.length === 0 && traditional);
      if (hant) traditional = true;
      else found = 'zh-Hans';
    } else if (primary === 'hi') {
      if (!rest.includes('latn')) found = 'hi';
    } else found = primary;
    if (found && supported.includes(found)) return found;
  }
  return supported.includes('en') ? 'en' : supported[0];
}

/** The language the interface shows: the chosen one, or the browser's best match on 'auto'. */
export const resolveLanguage = (choice, tags) => (isLanguage(choice) ? choice : matchLanguage(tags, LANGUAGES));
