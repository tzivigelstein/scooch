# The site

Besides the editor (`/`, rendered in the browser), the build publishes static
pages for search engines and AI assistants: guides for each use, the
questions, the legal pages, `sitemap.xml`, `robots.txt` and `llms.txt`. The
Vite plugin in `src/site/plugin.ts` renders them from `src/site` while
building (and on each request in `yarn dev`). They are plain HTML with their
CSS inline and no font to download; the calculator's page loads one small
script, built on its own so it never pulls in the editor.

The editor's `index.html` gets its canonical URL, share tags and the
tool's structured data (`WebApplication`) from the same plugin, and a line
saying what the tool does inside the loading screen.

## Before publishing

| Variable | What it is |
| --- | --- |
| `SITE_URL` | The public address, just the origin (`https://example.com`). Canonical URLs, the sitemap, `llms.txt` and the share tags use it. Unset, they point to `https://scooch.invalid`. |
| `VERCEL_ENV` | Vercel sets it to `production` on production deployments: that build is a **release**. Set it yourself to try a release locally. |
| `SCOOCH_ALLOW_DRAFT` | `1` lets a release go out anyway, as a draft. |

A release **stops** with a list of what is missing while `SITE_URL` is
unset or invalid, or a legal text (`docs/legal/terminos.md`,
`docs/legal/privacidad.md`, `LICENSE`) still has a placeholder (`<TITULAR>`,
`<CORREO DE CONTACTO>`, `<PAÍS / JURISDICCIÓN>`, `<FECHA DE VIGENCIA>`,
`<COPYRIGHT HOLDER>`) or the draft note («_Borrador. …_»). Any other build
(local, CI, Vercel previews, the e2e suite) warns and goes on. While a legal
page has a placeholder it carries `noindex` and stays out of the sitemap.

The variables can also go in a `.env.local` file, which Vite reads (don't
commit it).

`src/site/share.png` is the image shown when a page is shared: `share.svg`
rendered at 1200 × 630 with the Inter font.

## Adding a content page

1. Write it in `src/site/content/es/`, like the others: a function that
   returns `guide({...})` (`src/site/guide.ts`), with its address added to
   `content/es/paths.ts` and the function to `content/es/index.ts`.
2. One intent per page, the answer first (`lead`), and buttons that open the
   editor set up (`editorHref`, see [deep-links.md](deep-links.md)).
3. Name buttons and options with `ui('bar.arrange')` and the like, so a
   renamed button renames it in the guides; papers and photo sizes with
   `paperName` and `photoName`; measures with `mm` and `size`.
4. Never type a count by hand: `capacity` (and `sheetFigure`, `table`) work
   it out with the real packer. A sentence that describes a particular
   layout checks its number with `expect(...)` so the build stops if the
   packer ever says otherwise.
5. Questions go in `faq`: they show at the end and become `FAQPage` data.
6. Follow [copy.md](copy.md). `tests/site/pages.test.ts` checks every page
   (one `<h1>`, title, description, canonical, structured data, links,
   nothing of the editor, some copy rules) and every editor link it carries.

Another language: a `content/<lang>/` folder with the same page ids; the
hreflang links appear once a page exists in two languages (`src/site/langs.ts`).
