// The site's settings for one build, from the environment (see docs/site.md):
//   SITE_URL             the public address (canonical URLs, sitemap, share tags)
//   VERCEL_ENV           «production» on Vercel's production deployments: a release
//   SCOOCH_ALLOW_DRAFT   «1»: a release may go out with placeholders (a draft)
// A release stops while SITE_URL is missing or the legal texts have
// placeholders; any other build (local, CI, previews, the e2e suite) goes on
// with a warning and uses PLACEHOLDER_URL.

/** The address while SITE_URL isn't set: a reserved domain (RFC 2606) that can never be anyone's. */
export const PLACEHOLDER_URL = 'https://scooch.invalid';

/** The variables read (Vite's loadEnv takes these prefixes). */
export const ENV_PREFIXES = ['SITE_URL', 'VERCEL_ENV', 'SCOOCH_'];

export type SiteEnv = Partial<Record<'SITE_URL' | 'VERCEL_ENV' | 'SCOOCH_ALLOW_DRAFT', string>>;

export interface Site {
  /** The origin, without a trailing slash. */
  url: string;
  /** SITE_URL is missing or not usable: `url` is the placeholder. */
  placeholder: boolean;
  /** Why SITE_URL can't be used, when it was set. */
  urlProblem: string | null;
  /** A production deployment: problems stop it unless drafts are allowed. */
  release: boolean;
  allowDraft: boolean;
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/** SITE_URL as an origin, or why it can't be one. */
export function checkSiteUrl(value: string): { url: string } | { problem: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { problem: `SITE_URL «${value}» is not a URL` };
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOCAL.has(parsed.hostname))) return { problem: `SITE_URL «${value}» must use https` };
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return { problem: `SITE_URL «${value}» must be just an origin, like https://example.com` };
  return { url: parsed.origin };
}

export function siteFromEnv(env: SiteEnv): Site {
  const release = env.VERCEL_ENV === 'production';
  const allowDraft = env.SCOOCH_ALLOW_DRAFT === '1';
  const value = env.SITE_URL?.trim();
  if (!value) return { url: PLACEHOLDER_URL, placeholder: true, urlProblem: null, release, allowDraft };
  const checked = checkSiteUrl(value);
  if ('problem' in checked) return { url: PLACEHOLDER_URL, placeholder: true, urlProblem: checked.problem, release, allowDraft };
  return { url: checked.url, placeholder: false, urlProblem: null, release, allowDraft };
}

/** An absolute URL on the site. */
export const absolute = (site: Pick<Site, 'url'>, path: string) => `${site.url}${path}`;

/**
 * The message for a build that can't be published as it is (`problems`, one
 * per line), and whether it stops the build.
 */
export function publishVerdict(site: Site, problems: readonly string[]): { stop: boolean; message: string } | null {
  if (!problems.length) return null;
  const list = problems.map((p) => `  - ${p}`).join('\n');
  if (site.release && !site.allowDraft) {
    return {
      stop: true,
      message: `The site can't be published yet:\n${list}\nFill these in (see docs/site.md), or set SCOOCH_ALLOW_DRAFT=1 to publish a draft anyway.`,
    };
  }
  return { stop: false, message: `This build is a draft of the site (a production deployment would stop):\n${list}` };
}

/** What stops a release because of the address. */
export function urlProblems(site: Site): string[] {
  if (site.urlProblem) return [`${site.urlProblem}: canonical URLs, the sitemap and the share tags would point to ${PLACEHOLDER_URL}`];
  if (site.placeholder) return [`SITE_URL is not set: canonical URLs, the sitemap and the share tags would point to ${PLACEHOLDER_URL}`];
  return [];
}
