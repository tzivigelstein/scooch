// @vitest-environment jsdom
// When the editor can't open (src/services/bootFailure.ts): the skeleton of
// index.html gives way to a message in the page's language, from the texts
// index.html carries, with a button that reloads. When main.tsx calls it is
// in e2e/specs/boot-and-build.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LANGUAGES } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import { textsFor } from '../../src/copy/index.ts';
import { fillStaticCopy } from '../../src/copy/static.ts';
import { showBootFailure } from '../../src/services/bootFailure.ts';

// index.html as Vite serves it, without running its scripts.
const PAGE = fillStaticCopy(readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8'));
const part = (tag: string) => new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`).exec(PAGE)![1];

function openPage(language: string) {
  document.head.innerHTML = part('head');
  document.body.innerHTML = part('body');
  document.documentElement.lang = language;
}

beforeEach(() => openPage('es'));

describe('when the editor can’t open', () => {
  test.each(LANGUAGES.map((l) => [l]))('in %s: the skeleton gives way to the message and «Recargar la página», which has the focus and reloads', (language) => {
    openPage(language);
    const { t } = textsFor(CATALOGUES[language]);
    const reload = vi.fn();
    showBootFailure(reload);
    expect(document.querySelector('.boot')).toBeNull();
    const box = document.getElementById('boot-failed')!;
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.querySelector('p')!.textContent).toBe(t('app.bootFailed'));
    const button = box.querySelector('button')!;
    expect(button.textContent).toBe(t('notices.reload'));
    expect(document.activeElement).toBe(button);
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  test('said once, however many failures come', () => {
    showBootFailure();
    showBootFailure();
    expect(document.querySelectorAll('#boot-failed')).toHaveLength(1);
  });
});
