// The texts index.html carries itself (src/copy/static.ts): Spanish where
// crawlers read, every language's no-JavaScript message, and the data the
// head's script reads to show the page in the chosen language before the
// first paint.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LANGUAGES, matchLanguage } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import { textsFor } from '../../src/copy/index.ts';
import { bootCopy, fillStaticCopy } from '../../src/copy/static.ts';

const INDEX = readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8');
const filled = fillStaticCopy(INDEX, { chunks: { es: '/assets/copy-es-x.js' } });

describe('index.html with its texts', () => {
  test('no placeholder is left, and what crawlers read is Spanish', () => {
    const { t } = textsFor(CATALOGUES.es);
    expect(filled).not.toMatch(/\{\{[\w.]+\}\}/);
    expect(filled).toContain(`<title>${t('app.title')}</title>`);
    expect(filled).toContain('<html lang="es">');
  });

  test('without JavaScript, the message in every language, each marked with its own', () => {
    const noscript = /<noscript><div class="noscript">([\s\S]*?)<\/div><\/noscript>/.exec(filled)![1];
    expect([...noscript.matchAll(/<p lang="([\w-]+)">/g)].map((m) => m[1])).toEqual([...LANGUAGES]);
    for (const language of LANGUAGES) expect(noscript).toContain(textsFor(CATALOGUES[language]).t('app.noscript'));
  });

  test('the head’s data: each language’s title, description and heading, and the file of its texts', () => {
    const json = /<script type="application\/json" id="boot-copy">([\s\S]*?)<\/script>/.exec(filled)![1];
    expect(json).not.toContain('<');
    const data = JSON.parse(json);
    expect(data).toEqual(bootCopy({ chunks: { es: '/assets/copy-es-x.js' } }));
    expect(data.languages).toEqual([...LANGUAGES]);
    for (const language of LANGUAGES) {
      const { t } = textsFor(CATALOGUES[language]);
      expect(data.texts[language]).toEqual({ title: t('app.title'), description: t('app.description'), heading: t('app.heading') });
    }
    expect(data.chunks).toEqual({ es: '/assets/copy-es-x.js' });
  });

  test('the head’s script picks the language with the app’s own matchLanguage', () => {
    expect(filled).toContain(`(${matchLanguage.toString()})(navigator.languages`);
  });
});
