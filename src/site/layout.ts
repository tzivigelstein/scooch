// The frame of every content page: <head> with its metadata, the header with
// a way back to the editor, the breadcrumb, the page and the footer, with the
// links to the same page in the other languages.

import { APP_NAME } from '../config.ts';
import { esc, scriptJson } from './html.ts';
import { hreflangOf, LANGUAGES, languageName } from './langs.ts';
import { alternates, breadcrumbLd, faqLd, shareTags } from './seo.ts';
import { SITE_CSS, STACKED_CSS } from './styles.ts';
import type { SiteContext, SitePage } from './types.ts';

/** The texts of the frame, in the page's language. */
export interface Chrome {
  skip: string;
  open: string;
  crumbs: string;
  guides: string;
  legal: string;
  /** The heading of the links to the page in other languages. */
  languages: string;
  about: string;
  faq: string;
  imageAlt: string;
  /** The footer's legal links: [label, path]. */
  legalLinks: readonly (readonly [string, string])[];
}

/** The app's mark (as in its top bar), in the brand color. */
export const BRAND_MARK =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">' +
  '<rect x="7" y="2.5" width="14" height="17" rx="2.5" fill="currentColor" opacity=".28"/><rect x="3" y="5" width="14" height="17" rx="2.5" fill="currentColor"/>' +
  '<rect x="6" y="8.5" width="4" height="5" rx="1" fill="#fff"/><rect x="11" y="8.5" width="3" height="3" rx=".8" fill="#fff"/>' +
  '<rect x="11" y="12.5" width="3" height="6" rx=".8" fill="#fff"/><rect x="6" y="14.5" width="4" height="4" rx="1" fill="#fff"/></svg>';

/** The same icon as the editor's (index.html). */
export const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect x='7' y='2.5' width='14' height='17' rx='2.5' fill='%230066ff' opacity='.3'/><rect x='3' y='5' width='14' height='17' rx='2.5' fill='%230066ff'/><rect x='6' y='8.5' width='4' height='5' rx='1' fill='white'/><rect x='11' y='8.5' width='3' height='3' rx='.8' fill='white'/><rect x='11' y='12.5' width='3' height='6' rx='.8' fill='white'/><rect x='6' y='14.5' width='4' height='4' rx='1' fill='white'/></svg>";

const meta = (attr: string, name: string, content: string) => `<meta ${attr}="${esc(name)}" content="${esc(content)}">`;
const ldScript = (data: unknown) => `<script type="application/ld+json">${scriptJson(data)}</script>`;

function faqSection(page: SitePage, chrome: Chrome) {
  if (!page.faq?.length) return '';
  const items = page.faq.map(({ q, a }) => `<h3>${esc(q)}</h3><p>${a}</p>`).join('');
  return `<section class="faq" aria-labelledby="faq"><h2 id="faq">${esc(chrome.faq)}</h2>${items}</section>`;
}

/**
 * Plain links to the page's versions in every language, each named in its
 * own language; none while it has only one. Unlike hreflang, a version that
 * isn't indexed (a legal draft) is listed too: it is still the same page.
 */
function languageLinks(page: SitePage, ctx: SiteContext, chrome: Chrome) {
  if (page.kind === 'error') return '';
  const versions = LANGUAGES.flatMap((lang) => ctx.pages.filter((p) => p.id === page.id && p.lang === lang));
  if (versions.length < 2) return '';
  const items = versions
    .map((p) => `<li><a href="${esc(p.path)}" hreflang="${esc(hreflangOf(p.lang))}" lang="${esc(hreflangOf(p.lang))}"${p.lang === page.lang ? ' aria-current="page"' : ''}>${esc(languageName(p.lang))}</a></li>`)
    .join('');
  return `\n<nav aria-labelledby="footer-languages"><h2 id="footer-languages">${esc(chrome.languages)}</h2><ul>${items}</ul></nav>`;
}

export function renderPage(page: SitePage, ctx: SiteContext, chrome: Chrome) {
  // A page with an address of its own; the error page shows at any missing one.
  const addressed = page.kind !== 'error';
  const crumbs = [
    { name: APP_NAME, path: '/' },
    { name: page.crumb, path: page.path },
  ];
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(page.title)}</title>`,
    meta('name', 'description', page.description),
    addressed ? `<link rel="canonical" href="${esc(`${ctx.url}${page.path}`)}">` : '',
    ...alternates(page, ctx.pages).map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(`${ctx.url}${a.path}`)}">`),
    page.indexable ? '' : meta('name', 'robots', 'noindex'),
    meta('name', 'color-scheme', 'light dark'),
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#15171c" media="(prefers-color-scheme: dark)">',
    `<link rel="icon" href="${FAVICON}">`,
    ...(addressed ? shareTags(ctx.url, { title: page.title, description: page.description, path: page.path, imageAlt: chrome.imageAlt }) : []).map(([attr, name, content]) => meta(attr, name, content)),
    addressed ? ldScript(breadcrumbLd(ctx.url, crumbs)) : '',
    page.faq?.length ? ldScript(faqLd(page.faq)) : '',
    `<style>${SITE_CSS.trim()}${page.body.includes('table-stack') ? STACKED_CSS.trimEnd() : ''}</style>`,
  ].filter(Boolean);

  const guides = ctx.pages.filter((p) => p.lang === page.lang && p.kind === 'guide');
  const faqPage = ctx.pages.find((p) => p.lang === page.lang && p.kind === 'faq');
  const footerLinks = [...guides, ...(faqPage ? [faqPage] : [])].map((p) => `<li><a href="${esc(p.path)}"${p.path === page.path ? ' aria-current="page"' : ''}>${esc(p.crumb)}</a></li>`).join('');
  const legalLinks = chrome.legalLinks.map(([label, path]) => `<li><a href="${esc(path)}"${path === page.path ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('');
  const scripts = (page.scripts ?? []).map((name) => `<script type="module" src="${esc(ctx.scripts[name])}"></script>`).join('');

  return `<!doctype html>
<html lang="${esc(page.lang)}">
<head>
${head.join('\n')}
</head>
<body>
<a class="skip" href="#main">${esc(chrome.skip)}</a>
<header class="site-header"><div class="wrap"><a class="brand" href="/">${BRAND_MARK}<span>${esc(APP_NAME)}</span></a><a class="btn btn-primary btn-small" href="/">${esc(chrome.open)}</a></div></header>
<main id="main" class="wrap">
<nav class="crumbs" aria-label="${esc(chrome.crumbs)}"><ol><li><a href="/">${esc(APP_NAME)}</a></li><li aria-current="page">${esc(page.crumb)}</li></ol></nav>
<h1>${esc(page.h1)}</h1>
${page.body}
${faqSection(page, chrome)}
</main>
<footer class="site-footer"><div class="wrap">
<nav aria-labelledby="footer-guides"><h2 id="footer-guides">${esc(chrome.guides)}</h2><ul>${footerLinks}</ul></nav>
<nav aria-labelledby="footer-legal"><h2 id="footer-legal">${esc(chrome.legal)}</h2><ul>${legalLinks}</ul></nav>${languageLinks(page, ctx, chrome)}
<p>${esc(chrome.about)}</p>
</div></footer>
${scripts}
</body>
</html>
`;
}
