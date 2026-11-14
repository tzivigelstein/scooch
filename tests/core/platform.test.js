// Telling an Apple keyboard from the others by what the browser says of itself.
import { describe, expect, test } from 'vitest';
import { isApplePlatform } from '../../src/core/platform.js';

describe('an Apple device', () => {
  test.each([
    ['Chrome on macOS (userAgentData)', { userAgentData: { platform: 'macOS' }, platform: 'MacIntel' }],
    ['Safari on macOS (no userAgentData)', { platform: 'MacIntel' }],
    ['an iPhone', { platform: 'iPhone' }],
    ['an iPad that says it is an iPad', { platform: 'iPad' }],
    ['an iPad that says it is a Mac', { platform: 'MacIntel' }],
    ['an iPod', { platform: 'iPod touch' }],
    ['userAgentData without a platform, navigator.platform of a Mac', { userAgentData: { platform: '' }, platform: 'MacIntel' }],
  ])('%s', (_, nav) => {
    expect(isApplePlatform(nav)).toBe(true);
  });

  test.each([
    ['Chrome on Windows', { userAgentData: { platform: 'Windows' }, platform: 'Win32' }],
    ['Chrome on Linux', { userAgentData: { platform: 'Linux' }, platform: 'Linux x86_64' }],
    ['Chrome on Android', { userAgentData: { platform: 'Android' }, platform: 'Linux armv81' }],
    ['a Chromebook', { userAgentData: { platform: 'Chrome OS' }, platform: 'Linux x86_64' }],
    ['Firefox on Windows', { platform: 'Win32' }],
    ['a browser that says nothing', { platform: '' }],
    ['no navigator', undefined],
  ])('not %s', (_, nav) => {
    expect(isApplePlatform(nav)).toBe(false);
  });
});
