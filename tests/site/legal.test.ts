import { describe, expect, test } from 'vitest';
import {
  CUSTOM_PAPER_STORAGE,
  DONATE_STORAGE,
  GRID_STORAGE,
  JOURNAL_PREFIX,
  LAST_PROJECT_STORAGE,
  PRINT_STORAGE,
  SAVINGS_STORAGE,
  SECTIONS_STORAGE,
  SINGLE_KEYS_STORAGE,
  THEME_STORAGE,
  UNIT_STORAGE,
  VIEW_STORAGE,
} from '../../src/config.ts';
import { legalPage } from '../../src/site/content/es/legal.ts';
import { legalLink, legalProblems, publishLegal } from '../../src/site/legal.ts';
import { renderMarkdown } from '../../src/site/markdown.ts';
import { readLegal } from '../../src/site/site.ts';
import { SETTINGS } from '../../src/state/settings.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const docs = readLegal(ROOT);
const doc = (id: string) => docs.find((d) => d.id === id)!;

/**
 * Where the privacy policy («Qué se guarda en tu dispositivo») tells about
 * each localStorage key of the settings registry (src/state/settings.ts):
 * the bold term its item starts with.
 */
const POLICY_TERMS: Readonly<Record<string, string>> = {
  [UNIT_STORAGE]: 'Unidades',
  [THEME_STORAGE]: 'Tema',
  [SINGLE_KEYS_STORAGE]: 'Atajos de 1 tecla',
  [VIEW_STORAGE]: 'Vista',
  [GRID_STORAGE]: 'Grilla e imán',
  [SECTIONS_STORAGE]: 'Secciones de Propiedades',
  [PRINT_STORAGE]: 'Avisos al imprimir',
  [CUSTOM_PAPER_STORAGE]: 'Papel personalizado',
  [SAVINGS_STORAGE]: 'Hojas ahorradas',
  [DONATE_STORAGE]: 'Invitación a aportar',
  [LAST_PROJECT_STORAGE]: 'Último proyecto',
  [JOURNAL_PREFIX]: 'Copia temporal',
};

/** The document with its placeholders filled in and its draft note gone, as the owner will leave it. */
const finished = (text: string) =>
  text
    .replace(/`?<[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /]*>`?/g, 'Valor real')
    .split(/\n\s*\n/)
    .filter((block) => !block.trim().startsWith('_Borrador.'))
    .join('\n\n');

describe('publishing a legal document', () => {
  test('comments go, the first heading becomes the title, and links to the other documents point to their pages', () => {
    const published = publishLegal('terms', '<!--\nBORRADOR `<TITULAR>`\n-->\n\n# Términos de uso\n\nVer la [Política](privacidad.md#qué-se-guarda) y [LICENSE](../../LICENSE).');
    expect(published.title).toBe('Términos de uso');
    expect(published.markdown).toBe('Ver la [Política](privacidad.md#qué-se-guarda) y [LICENSE](../../LICENSE).');
    expect(published.placeholders).toEqual([]);
    expect(renderMarkdown(published.markdown, { link: legalLink })).toBe('<p>Ver la <a href="/es/privacidad#qué-se-guarda">Política</a> y <a href="/es/licencia">LICENSE</a>.</p>');
  });

  test('a link to a file without a page stops the build instead of publishing a broken link', () => {
    expect(() => legalLink('../../README.md')).toThrow(/README\.md/);
    expect(legalLink('https://vercel.com/legal/privacy-notice')).toBe('https://vercel.com/legal/privacy-notice');
    expect(legalLink('#lo-que-no-hacemos')).toBe('#lo-que-no-hacemos');
  });

  test('the privacy policy loses its analytics section while it only holds the reminder, and keeps it once it says something', () => {
    const text = (body: string) => `# Política\n\n## Otros servicios\n\n### Alojamiento\n\nVercel.\n\n### Analítica\n\n${body}\n\n## Menores de edad\n\nTexto.`;
    const reminder = publishLegal('privacy', text('> **PENDIENTE: completar solo si se agrega analítica.** Hoy no hay.\n> Sigue.'));
    expect(reminder.markdown).not.toContain('Analítica');
    expect(reminder.markdown).toContain('### Alojamiento\n\nVercel.\n\n## Menores de edad');
    const written = publishLegal('privacy', text('Usamos una herramienta que no guarda cookies.'));
    expect(written.markdown).toContain('### Analítica\n\nUsamos una herramienta que no guarda cookies.');
  });

  test('the notices lose «How to update this file», which is for maintainers', () => {
    const published = publishLegal('notices', '# Third-party notices\n\n## Summary\n\nA.\n\n## How to update this file\n\nRun this.\n\n## License texts\n\nB.');
    expect(published.markdown).toBe('## Summary\n\nA.\n\n## License texts\n\nB.');
  });

  test('placeholders and the draft note are what stops a document', () => {
    const draft = publishLegal('terms', '_Borrador. No es asesoramiento\nlegal._\n\n# Términos\n\nVigentes desde `<FECHA DE VIGENCIA>`. Lo ofrece `<TITULAR>`.');
    expect(draft.draftNote).toBe(true);
    expect(legalProblems(draft)).toEqual([
      'docs/legal/terminos.md still has placeholders: <FECHA DE VIGENCIA>, <TITULAR>',
      'docs/legal/terminos.md still starts with the draft note («_Borrador. …_»)',
    ]);
  });
});

describe('the documents in the repository', () => {
  test('every document renders, every link of theirs has a page, and the drafts say what is missing', () => {
    for (const d of docs) expect(() => renderMarkdown(d.markdown, { link: legalLink })).not.toThrow();
    expect(doc('terms').placeholders).toEqual(expect.arrayContaining(['<TITULAR>', '<CORREO DE CONTACTO>', '<PAÍS / JURISDICCIÓN>', '<FECHA DE VIGENCIA>']));
    expect(doc('privacy').placeholders).toEqual(expect.arrayContaining(['<TITULAR>', '<CORREO DE CONTACTO>', '<FECHA DE VIGENCIA>']));
    expect(doc('license').placeholders).toEqual(['<COPYRIGHT HOLDER>']);
    expect(doc('notices').placeholders).toEqual([]);
  });

  test('the privacy policy has an item for every key the settings registry keeps in this browser', () => {
    const keys = [...new Set(SETTINGS.filter((s) => s.lives === 'device').map((s) => s.storage!))].sort();
    // A key added to the registry needs its item in the policy, and its term here.
    expect(Object.keys(POLICY_TERMS).sort()).toEqual(keys);
    const stored = /## Qué se guarda en tu dispositivo\n([\s\S]*?)\n## /.exec(doc('privacy').markdown)![1];
    for (const [key, term] of Object.entries(POLICY_TERMS)) expect(stored, key).toContain(`- **${term}:**`);
  });

  test('the published privacy policy has no analytics reminder, and still says there is no analytics', () => {
    expect(doc('privacy').markdown).not.toMatch(/PENDIENTE|### Analítica/);
    expect(doc('privacy').markdown).toMatch(/no usa cookies, publicidad, rastreadores ni herramientas de\s+analítica/);
  });

  test('while they are drafts, the terms and the policy are kept out of search engines; once finished, they are listed', async () => {
    const { readFileSync } = await import('node:fs');
    for (const [id, file] of [
      ['terms', 'docs/legal/terminos.md'],
      ['privacy', 'docs/legal/privacidad.md'],
    ] as const) {
      expect(legalPage(doc(id)).indexable).toBe(false);
      const done = publishLegal(id, finished(readFileSync(`${ROOT}${file}`, 'utf8')));
      expect(legalProblems(done)).toEqual([]);
      expect(legalPage(done).indexable).toBe(true);
    }
  });

  test('the license texts, in English, are never listed, and say so in their language', () => {
    for (const id of ['notices', 'license']) {
      const page = legalPage(doc(id));
      expect(page.indexable).toBe(false);
      expect(page.body).toMatch(/<div class="doc-lang" lang="en">/);
    }
  });
});
