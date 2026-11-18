// Where the site's Spanish legal pages are published (src/site builds them
// from docs/legal, LICENSE and THIRD_PARTY_NOTICES.md): the reference the
// translated ones link to. Without a trailing slash, as their canonical URLs
// (vercel.json: cleanUrls).
export const LEGAL_PATHS = Object.freeze({
  terms: '/es/terminos',
  privacy: '/es/privacidad',
  notices: '/es/licencias-de-terceros',
  license: '/es/licencia',
});
