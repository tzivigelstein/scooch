import { describe, expect, test } from 'vitest';
import { checkSiteUrl, PLACEHOLDER_URL, publishVerdict, siteFromEnv, urlProblems } from '../../src/site/config.ts';

describe('SITE_URL', () => {
  test.each([
    ['https://example.com', 'https://example.com'],
    ['https://example.com/', 'https://example.com'],
    ['https://Sub.Example.com:8443', 'https://sub.example.com:8443'],
    ['http://localhost:4561', 'http://localhost:4561'],
    ['http://127.0.0.1:4561/', 'http://127.0.0.1:4561'],
  ])('«%s» is the origin %s', (value, url) => {
    expect(checkSiteUrl(value)).toEqual({ url });
  });

  test.each([
    ['example.com', /not a URL/],
    ['http://example.com', /https/],
    ['ftp://example.com', /https/],
    ['https://example.com/scooch', /just an origin/],
    ['https://example.com/?a=1', /just an origin/],
    ['https://user:pass@example.com', /just an origin/],
  ])('«%s» is refused', (value, problem) => {
    const checked = checkSiteUrl(value);
    expect('problem' in checked && checked.problem).toMatch(problem);
  });

  test('missing or unusable, the placeholder is used and that is a problem', () => {
    expect(siteFromEnv({})).toMatchObject({ url: PLACEHOLDER_URL, placeholder: true, urlProblem: null });
    expect(urlProblems(siteFromEnv({ SITE_URL: '  ' }))).toEqual([expect.stringMatching(/^SITE_URL is not set/)]);
    expect(urlProblems(siteFromEnv({ SITE_URL: 'http://example.com' }))).toEqual([expect.stringMatching(/must use https.*would point to https:\/\/scooch\.invalid/)]);
    expect(urlProblems(siteFromEnv({ SITE_URL: 'https://example.com' }))).toEqual([]);
  });
});

describe('what a build does with problems', () => {
  const problems = ['SITE_URL is not set', 'docs/legal/terminos.md still has placeholders: <TITULAR>'];

  test('a production deployment on Vercel stops, saying what to fill in and how to publish a draft', () => {
    const verdict = publishVerdict(siteFromEnv({ VERCEL_ENV: 'production' }), problems);
    expect(verdict?.stop).toBe(true);
    expect(verdict?.message).toContain('  - SITE_URL is not set\n  - docs/legal/terminos.md still has placeholders: <TITULAR>');
    expect(verdict?.message).toContain('SCOOCH_ALLOW_DRAFT=1');
  });

  test('with SCOOCH_ALLOW_DRAFT=1 it goes on, as a draft', () => {
    expect(publishVerdict(siteFromEnv({ VERCEL_ENV: 'production', SCOOCH_ALLOW_DRAFT: '1' }), problems)).toMatchObject({ stop: false, message: expect.stringMatching(/draft/) });
  });

  test.each([{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }])('any other build (%o) goes on, as a draft', (env) => {
    expect(publishVerdict(siteFromEnv(env), problems)?.stop).toBe(false);
  });

  test('with nothing missing there is nothing to say', () => {
    expect(publishVerdict(siteFromEnv({ VERCEL_ENV: 'production', SITE_URL: 'https://example.com' }), [])).toBeNull();
  });
});
