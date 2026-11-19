// @vitest-environment jsdom
// The brand in the editor's top bar is the mark and the app's name, not a
// link: following it would only reload the editor onto itself, losing the
// selection and a crop in progress. (The site's pages link theirs to the
// editor: tests/site/pages.test.ts.)
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Topbar } from '../../src/components/topbar/Topbar.tsx';
import { resetState } from '../support/state.ts';

afterEach(cleanup);

test('the brand reads as the app’s name and is neither a link, a button nor a tab stop', () => {
  resetState();
  render(<Topbar />);
  const bar = screen.getByRole('banner');
  expect(within(bar).queryAllByRole('link')).toEqual([]);
  const brand = bar.querySelector('.brand')!;
  expect(brand.textContent).toBe('Scooch');
  expect(brand.matches('a, button, [role], [tabindex]')).toBe(false);
  expect(brand.querySelector('a, button, [tabindex]')).toBeNull();
});

test('a page the browser translates leaves the app’s name and the keys as they are', () => {
  resetState();
  render(<Topbar />);
  expect(document.querySelector('.brand-name')!.getAttribute('translate')).toBe('no');
  expect([...document.querySelectorAll('.topbar kbd')].map((kbd) => kbd.getAttribute('translate'))).toEqual(['no']);
});
