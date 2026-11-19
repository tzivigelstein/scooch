import { describe, expect, test } from 'vitest';
import { findPlaceholders, headingId, renderMarkdown, stripComments } from '../../src/site/markdown.ts';

const md = (text: string, options = {}) => renderMarkdown(text, options);

describe('blocks', () => {
  test('headings get GitHub’s ids, repeated ones a number, and can move down levels', () => {
    expect(md('# Términos de uso\n\n## 1. Qué es Scooch\n\n## Notas\n\n## Notas')).toBe(
      '<h1 id="términos-de-uso">Términos de uso</h1>\n<h2 id="1-qué-es-scooch">1. Qué es Scooch</h2>\n<h2 id="notas">Notas</h2>\n<h2 id="notas-1">Notas</h2>'
    );
    expect(md('# Third-party notices\n## Summary', { shift: 1 })).toBe('<h2 id="third-party-notices">Third-party notices</h2>\n<h3 id="summary">Summary</h3>');
    expect(headingId('Lo que no hacemos')).toBe('lo-que-no-hacemos');
  });

  test('a heading in Devanagari keeps its vowel signs, as on GitHub, so two headings don’t end up with one id', () => {
    expect(headingId('हम क्या नहीं करते')).toBe('हम-क्या-नहीं-करते');
    expect(headingId('कैसे करें')).not.toBe(headingId('कसे कर'));
  });

  test('lines of a paragraph join; a blank line starts another', () => {
    expect(md('Una línea\ny la siguiente.\n\nOtro párrafo.')).toBe('<p>Una línea y la siguiente.</p>\n<p>Otro párrafo.</p>');
  });

  test('lines of Chinese join without a space, also next to Latin letters, numbers and full-width punctuation', () => {
    expect(md('你的文件不会\n离开浏览器，\nPDF也在\n浏览器中生成。\n\n- 最多50\n  步。Scooch\n  不使用Cookie')).toBe('<p>你的文件不会离开浏览器，PDF也在浏览器中生成。</p>\n<ul><li>最多50步。Scooch不使用Cookie</li></ul>');
  });

  test('lists, with items that continue on indented lines', () => {
    expect(md('- uno;\n- dos,\n  sigue;\n\n1. primero\n2. segundo')).toBe('<ul><li>uno;</li><li>dos, sigue;</li></ul>\n<ol><li>primero</li><li>segundo</li></ol>');
  });

  test('block quotes hold their own blocks', () => {
    expect(md('> **PENDIENTE: completar.** Hoy no hay.\n> Sigue.')).toBe('<blockquote><p><strong>PENDIENTE: completar.</strong> Hoy no hay. Sigue.</p></blockquote>');
  });

  test('tables have a header row and scroll on their own', () => {
    expect(md('| Package | License |\n| --- | --- |\n| react | MIT |')).toBe(
      '<div class="table-wrap" tabindex="0"><table><thead><tr><th scope="col">Package</th><th scope="col">License</th></tr></thead><tbody><tr><td>react</td><td>MIT</td></tr></tbody></table></div>'
    );
  });

  test('in a table, an address can break after each «/»; with 5 columns or more, each value is named after its column', () => {
    const html = md('| Package | Version | License | Copyright | `Ships` in |\n| --- | --- | --- | --- | --- |\n| zustand | 5 | MIT | Paul | [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand) |');
    expect(html).toContain('<a href="https://github.com/pmndrs/zustand">github.com/<wbr>pmndrs/<wbr>zustand</a>');
    expect(html).toContain('data-label="Ships in"');
  });

  test('fenced code is shown as it is, escaped', () => {
    expect(md('```text\nCopyright <c> 2024 & co\n\n  indented\n```')).toBe('<pre tabindex="0"><code>Copyright &lt;c&gt; 2024 &amp; co\n\n  indented</code></pre>');
  });

  test('comments are dropped, other HTML shows as text', () => {
    expect(md('<!--\nBORRADOR <TITULAR>\n-->\nTexto <b>con</b> etiquetas')).toBe('<p>Texto &lt;b&gt;con&lt;/b&gt; etiquetas</p>');
    expect(stripComments('a<!-- x -->b<!--\ny\n-->c')).toBe('abc');
  });
});

describe('inline', () => {
  test('code (left as written when the page is translated), bold, italics and links', () => {
    expect(md('Vigente desde `<FECHA DE VIGENCIA>`. Cuando dice _nosotros_, **ojo**: [política](https://vercel.com/legal/privacy-notice).')).toBe(
      '<p>Vigente desde <code translate="no">&lt;FECHA DE VIGENCIA&gt;</code>. Cuando dice <em>nosotros</em>, <strong>ojo</strong>: <a href="https://vercel.com/legal/privacy-notice">política</a>.</p>'
    );
  });

  test('bold italics', () => {
    expect(md('***As far as the law allows, the software comes as is.***')).toBe('<p><strong><em>As far as the law allows, the software comes as is.</em></strong></p>');
  });

  test('a link whose label is code, and an autolink', () => {
    expect(md('forks of [`afm`](https://github.com/chbrown/afm) and <https://polyformproject.org/licenses/>')).toBe(
      '<p>forks of <a href="https://github.com/chbrown/afm"><code translate="no">afm</code></a> and <a href="https://polyformproject.org/licenses/">https://polyformproject.org/licenses/</a></p>'
    );
  });

  test('underscores inside words are not italics', () => {
    expect(md('Ver THIRD_PARTY_NOTICES.md y snake_case_name.')).toBe('<p>Ver THIRD_PARTY_NOTICES.md y snake_case_name.</p>');
  });

  test('a paragraph wholly in italics, over several lines', () => {
    expect(md('_Borrador. No es asesoramiento legal. Tiene que revisarlo\nuna persona profesional._')).toBe(
      '<p><em>Borrador. No es asesoramiento legal. Tiene que revisarlo una persona profesional.</em></p>'
    );
  });

  test('links go where the option says', () => {
    const link = (href: string) => (href === 'privacidad.md' ? '/es/privacidad' : href);
    expect(md('La [Política de privacidad](privacidad.md) y [lo que no](#lo-que-no-hacemos).', { link })).toBe(
      '<p>La <a href="/es/privacidad">Política de privacidad</a> y <a href="#lo-que-no-hacemos">lo que no</a>.</p>'
    );
  });

  test('a link to a page in another language says that language', () => {
    const link = () => ({ href: '/es/terminos', hreflang: 'es' });
    expect(md('The [Spanish version](../terminos.md) is the reference.', { link })).toBe('<p>The <a href="/es/terminos" hreflang="es">Spanish version</a> is the reference.</p>');
  });
});

describe('placeholders', () => {
  test('each placeholder once, in order, leaving comments, autolinks and lowercase tags out', () => {
    const text = '<!-- <EN COMENTARIO> -->\n`<TITULAR>` y `<PAÍS / JURISDICCIÓN>`, otra vez `<TITULAR>`. <https://x.org> <b>no</b> Copyright 2026 <COPYRIGHT HOLDER>';
    expect(findPlaceholders(text)).toEqual(['<TITULAR>', '<PAÍS / JURISDICCIÓN>', '<COPYRIGHT HOLDER>']);
    expect(findPlaceholders('Nada que completar.')).toEqual([]);
  });
});
