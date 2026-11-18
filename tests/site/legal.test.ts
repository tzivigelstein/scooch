import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  CUSTOM_PAPER_STORAGE,
  DONATE_STORAGE,
  GRID_STORAGE,
  JOURNAL_PREFIX,
  LANGUAGE_STORAGE,
  LAST_PROJECT_STORAGE,
  PALETTE_STORAGE,
  PRINT_STORAGE,
  SAVINGS_STORAGE,
  SECTIONS_STORAGE,
  SINGLE_KEYS_STORAGE,
  THEME_STORAGE,
  TIPS_STORAGE,
  UNIT_STORAGE,
  VIEW_STORAGE,
} from '../../src/config.ts';
import { SITE_LANGUAGES } from '../../src/site/content/index.ts';
import { createKit } from '../../src/site/kit.ts';
import type { Lang } from '../../src/site/langs.ts';
import { legalFile, legalLink, legalProblems, publishLegal, type LegalDoc, type LegalId } from '../../src/site/legal.ts';
import { renderMarkdown } from '../../src/site/markdown.ts';
import { LEGAL_PATHS } from '../../src/site/paths.ts';
import { readLegal } from '../../src/site/site.ts';
import { SETTINGS } from '../../src/state/settings.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const docs = readLegal(ROOT);
const doc = (id: LegalId, lang: Lang = 'es') => docs.find((d) => d.id === id && d.lang === lang)!;
const language = (lang: Lang) => SITE_LANGUAGES.find((l) => l.lang === lang)!;
const ES = { lang: 'es' as const, markers: language('es').legalMarkers };
/** The page a language publishes for a document. */
const pageOf = (d: LegalDoc) => language(d.lang).pages(createKit(language(d.lang)), [d]).find((p) => p.id === `legal-${d.id}`)!;
const translations = SITE_LANGUAGES.filter((l) => l.lang !== 'es');

/**
 * Where each language's privacy policy tells about each localStorage key of
 * the settings registry (src/state/settings.ts): the section that lists what
 * is stored, the bold term each item starts with, and the sentence that says
 * there is no analytics. A key added to the registry needs its item in every
 * policy, and its term here; a new translation needs its entry.
 */
const POLICY: Partial<Record<Lang, { section: string; noAnalytics: RegExp; terms: Readonly<Record<string, string>> }>> = {
  es: {
    section: 'Qué se guarda en tu dispositivo',
    noAnalytics: /no usa cookies, publicidad, rastreadores ni herramientas de\s+analítica/,
    terms: {
      [UNIT_STORAGE]: 'Unidades',
      [THEME_STORAGE]: 'Tema',
      [LANGUAGE_STORAGE]: 'Idioma',
      [SINGLE_KEYS_STORAGE]: 'Atajos de 1 tecla',
      [VIEW_STORAGE]: 'Vista',
      [GRID_STORAGE]: 'Grilla e imán',
      [SECTIONS_STORAGE]: 'Secciones de Propiedades',
      [PRINT_STORAGE]: 'Avisos al imprimir',
      [CUSTOM_PAPER_STORAGE]: 'Papel personalizado',
      [PALETTE_STORAGE]: 'Acciones recientes',
      [TIPS_STORAGE]: 'Consejos de uso',
      [SAVINGS_STORAGE]: 'Hojas ahorradas',
      [DONATE_STORAGE]: 'Invitación a aportar',
      [LAST_PROJECT_STORAGE]: 'Último proyecto',
      [JOURNAL_PREFIX]: 'Copia temporal',
    },
  },
  en: {
    section: 'What is stored on your device',
    noAnalytics: /doesn’t use cookies, advertising, trackers or analytics\s+tools/,
    terms: {
      [UNIT_STORAGE]: 'Units',
      [THEME_STORAGE]: 'Theme',
      [LANGUAGE_STORAGE]: 'Language',
      [SINGLE_KEYS_STORAGE]: 'Single-key shortcuts',
      [VIEW_STORAGE]: 'View',
      [GRID_STORAGE]: 'Grid and snap',
      [SECTIONS_STORAGE]: 'Properties sections',
      [PRINT_STORAGE]: 'Printing notices',
      [CUSTOM_PAPER_STORAGE]: 'Custom paper',
      [PALETTE_STORAGE]: 'Recent actions',
      [TIPS_STORAGE]: 'Usage tips',
      [SAVINGS_STORAGE]: 'Sheets saved',
      [DONATE_STORAGE]: 'Invitation to support',
      [LAST_PROJECT_STORAGE]: 'Last project',
      [JOURNAL_PREFIX]: 'Temporary copy',
    },
  },
  fr: {
    section: 'Ce qui est enregistré sur votre appareil',
    noAnalytics: /n’utilise ni cookies, ni publicité, ni traceurs, ni outils de\s+mesure d’audience/,
    // French writes a no-break space before the colon: «**Unités :**».
    terms: Object.fromEntries(
      Object.entries({
        [UNIT_STORAGE]: 'Unités',
        [THEME_STORAGE]: 'Thème',
        [LANGUAGE_STORAGE]: 'Langue',
        [SINGLE_KEYS_STORAGE]: 'Raccourcis à 1 touche',
        [VIEW_STORAGE]: 'Affichage',
        [GRID_STORAGE]: 'Grille et aimantation',
        [SECTIONS_STORAGE]: 'Sections des Propriétés',
        [PRINT_STORAGE]: 'Impression',
        [CUSTOM_PAPER_STORAGE]: 'Papier personnalisé',
        [PALETTE_STORAGE]: 'Actions récentes',
        [TIPS_STORAGE]: 'Conseils d’utilisation',
        [SAVINGS_STORAGE]: 'Feuilles économisées',
        [DONATE_STORAGE]: 'Invitation à soutenir',
        [LAST_PROJECT_STORAGE]: 'Dernier projet',
        [JOURNAL_PREFIX]: 'Copie temporaire',
      }).map(([key, term]) => [key, `${term} `])
    ),
  },
};

/** The document with its placeholders filled in and its draft note gone, as the owner will leave it. */
const finished = (text: string, draft: string) =>
  text
    .replace(/`?<[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /]*>`?/g, 'Valor real')
    .split(/\n\s*\n/)
    .filter((block) => !block.trim().startsWith(draft))
    .join('\n\n');

describe('publishing a legal document', () => {
  test('comments go, the first heading becomes the title, and links to the other documents point to their pages', () => {
    const published = publishLegal('terms', '<!--\nBORRADOR `<TITULAR>`\n-->\n\n# Términos de uso\n\nVer la [Política](privacidad.md#qué-se-guarda) y [LICENSE](../../LICENSE).', ES);
    expect(published.title).toBe('Términos de uso');
    expect(published.markdown).toBe('Ver la [Política](privacidad.md#qué-se-guarda) y [LICENSE](../../LICENSE).');
    expect(published.placeholders).toEqual([]);
    expect(renderMarkdown(published.markdown, { link: (href) => legalLink(href, published, LEGAL_PATHS) })).toBe(
      '<p>Ver la <a href="/es/privacidad#qué-se-guarda">Política</a> y <a href="/es/licencia">LICENSE</a>.</p>'
    );
  });

  test('a translation links to its own language’s pages, and to the Spanish reference saying it is Spanish', () => {
    const en = { lang: 'en' as const, file: legalFile('en', 'terms') };
    const paths = { terms: '/en/terms', privacy: '/en/privacy', notices: '/en/notices', license: '/en/license' };
    expect(legalLink('privacy.md#cookies', en, paths)).toBe('/en/privacy#cookies');
    expect(legalLink('../../../LICENSE', en, paths)).toBe('/en/license');
    expect(legalLink('../terminos.md', en, paths)).toEqual({ href: '/es/terminos', hreflang: 'es' });
  });

  test('a link to a file without a page stops the build instead of publishing a broken link', () => {
    const terms = { lang: 'es' as const, file: legalFile('es', 'terms') };
    expect(() => legalLink('../../README.md', terms, LEGAL_PATHS)).toThrow(/README\.md/);
    expect(legalLink('https://vercel.com/legal/privacy-notice', terms, LEGAL_PATHS)).toBe('https://vercel.com/legal/privacy-notice');
    expect(legalLink('#lo-que-no-hacemos', terms, LEGAL_PATHS)).toBe('#lo-que-no-hacemos');
  });

  test('the privacy policy loses its analytics section while it only holds the reminder, and keeps it once it says something', () => {
    const text = (body: string) => `# Política\n\n## Otros servicios\n\n### Alojamiento\n\nVercel.\n\n### Analítica\n\n${body}\n\n## Menores de edad\n\nTexto.`;
    const reminder = publishLegal('privacy', text('> **PENDIENTE: completar solo si se agrega analítica.** Hoy no hay.\n> Sigue.'), ES);
    expect(reminder.markdown).not.toContain('Analítica');
    expect(reminder.markdown).toContain('### Alojamiento\n\nVercel.\n\n## Menores de edad');
    const written = publishLegal('privacy', text('Usamos una herramienta que no guarda cookies.'), ES);
    expect(written.markdown).toContain('### Analítica\n\nUsamos una herramienta que no guarda cookies.');
  });

  test('the notices lose «How to update this file», which is for maintainers', () => {
    const published = publishLegal('notices', '# Third-party notices\n\n## Summary\n\nA.\n\n## How to update this file\n\nRun this.\n\n## License texts\n\nB.', ES);
    expect(published.markdown).toBe('## Summary\n\nA.\n\n## License texts\n\nB.');
  });

  test('placeholders and the draft note are what stops a document', () => {
    const draft = publishLegal('terms', '_Borrador. No es asesoramiento\nlegal._\n\n# Términos\n\nVigentes desde `<FECHA DE VIGENCIA>`. Lo ofrece `<TITULAR>`.', ES);
    expect(draft.draftNote).toBe(true);
    expect(legalProblems(draft)).toEqual([
      'docs/legal/terminos.md still has placeholders: <FECHA DE VIGENCIA>, <TITULAR>',
      'docs/legal/terminos.md still starts with the draft note («_Borrador. …_»)',
    ]);
  });
});

describe('the documents in the repository', () => {
  test('every document renders, every link of theirs has a page, and the drafts say what is missing', () => {
    for (const d of docs) expect(() => pageOf(d), d.file).not.toThrow();
    for (const { lang } of SITE_LANGUAGES) {
      expect(doc('terms', lang).placeholders, lang).toEqual(expect.arrayContaining(['<TITULAR>', '<CORREO DE CONTACTO>', '<PAÍS / JURISDICCIÓN>', '<FECHA DE VIGENCIA>']));
      expect(doc('privacy', lang).placeholders, lang).toEqual(expect.arrayContaining(['<TITULAR>', '<CORREO DE CONTACTO>', '<FECHA DE VIGENCIA>']));
      expect(doc('license', lang).placeholders, lang).toEqual(['<COPYRIGHT HOLDER>']);
      expect(doc('notices', lang).placeholders, lang).toEqual([]);
    }
  });

  test('every language with content has the four documents', () => {
    for (const { lang } of SITE_LANGUAGES) expect(docs.filter((d) => d.lang === lang).map((d) => d.id), lang).toEqual(['terms', 'privacy', 'notices', 'license']);
  });

  test('every privacy policy has an item for every key the settings registry keeps in this browser', () => {
    const keys = [...new Set(SETTINGS.filter((s) => s.lives === 'device').map((s) => s.storage!))].sort();
    for (const { lang } of SITE_LANGUAGES) {
      const policy = POLICY[lang];
      expect(policy, `POLICY needs the terms of ${lang}’s privacy policy`).toBeDefined();
      // A key added to the registry needs its item in the policy, and its term here.
      expect(Object.keys(policy!.terms).sort(), lang).toEqual(keys);
      const stored = new RegExp(`## ${policy!.section}\\n([\\s\\S]*?)\\n## `).exec(doc('privacy', lang).markdown)![1];
      for (const [key, term] of Object.entries(policy!.terms)) expect(stored, `${lang}: ${key}`).toContain(`- **${term}:**`);
    }
  });

  test('every published privacy policy has no analytics reminder, and still says there is no analytics', () => {
    for (const { lang, legalMarkers } of SITE_LANGUAGES) {
      const { markdown } = doc('privacy', lang);
      expect(markdown, lang).not.toContain(legalMarkers.pending);
      expect(markdown, lang).not.toMatch(new RegExp(`#{2,}\\s+${legalMarkers.analytics}\\s*$`, 'm'));
      expect(markdown, lang).toMatch(POLICY[lang]!.noAnalytics);
    }
  });

  test('while they are drafts, the terms and the policy are kept out of search engines; once finished, they are listed', () => {
    for (const { lang, legalMarkers } of SITE_LANGUAGES)
      for (const id of ['terms', 'privacy'] as const) {
        expect(pageOf(doc(id, lang)).indexable, `${lang} ${id}`).toBe(false);
        const done = publishLegal(id, finished(readFileSync(`${ROOT}${legalFile(lang, id)}`, 'utf8'), legalMarkers.draft), { lang, markers: legalMarkers });
        expect(legalProblems(done), `${lang} ${id}`).toEqual([]);
        expect(pageOf(done).indexable, `${lang} ${id}`).toBe(true);
      }
  });

  test('a translation is a draft while the Spanish one is, keeps its placeholders, and says the Spanish version is the reference', () => {
    for (const { lang } of translations)
      for (const id of ['terms', 'privacy'] as const) {
        const d = doc(id, lang);
        expect(d.draftNote, `${lang} ${id}`).toBe(doc(id).draftNote);
        expect(d.placeholders, `${lang} ${id}`).toEqual(doc(id).placeholders);
        expect(pageOf(d).body, `${lang} ${id}`).toContain(`<a href="${LEGAL_PATHS[id]}" hreflang="es">`);
      }
  });

  test('the license texts are never listed, and are marked English where the page’s language isn’t', () => {
    for (const { lang } of SITE_LANGUAGES)
      for (const id of ['notices', 'license'] as const) {
        const page = pageOf(doc(id, lang));
        expect(page.indexable).toBe(false);
        expect(page.body).toContain(lang === 'en' ? '<div class="doc-lang">' : '<div class="doc-lang" lang="en">');
      }
  });
});
