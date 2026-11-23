# The site

Besides the editor (`/`, rendered in the browser), the build publishes static
pages for search engines and AI assistants: guides for each use, the
questions, the legal pages, `sitemap.xml`, `robots.txt` and `llms.txt`. The
Vite plugin in `src/site/plugin.ts` renders them from `src/site` while
building (and on each request in `yarn dev`). They are plain HTML with their
CSS inline, set in the editor's font, Inter, from the editor's own file
(«Fonts» below); the calculator's page loads one small script, built on its
own so it never pulls in the editor.

The editor's `index.html` gets its canonical URL, share tags and the
tool's structured data (`WebApplication`) from the same plugin, and a line
saying what the tool does on the sheet of the skeleton it shows while the
editor loads.

## Languages

The site's languages are the app's (`LANGUAGES` in `src/core/language.js`,
each named in itself by `src/copy/languages.ts`); the ones with content are
listed in `src/site/content/index.ts`: Spanish, the reference, English,
Simplified Chinese, Hindi and French.
Each page lives at `/<language>/<address>`, the language in lowercase
(`/es`, `/en`, `/zh-hans`, `/hi`, `/fr`) and the address in that language,
with the words people search for:

| Page (id) | Spanish | English |
| --- | --- | --- |
| `several-photos` | `/es/imprimir-varias-fotos-en-una-hoja` | `/en/print-multiple-pictures-on-one-page` |
| `how-many` (calculator) | `/es/cuantas-fotos-caben-en-una-hoja` | `/en/how-many-photos-fit-on-a-page` |
| `photos-10x15` | `/es/fotos-10x15-en-hoja-a4` | `/en/print-4x6-photos-on-a4` |
| `id-photos` | `/es/foto-carnet-para-imprimir` | `/en/print-passport-photos-at-home` |
| `same-photo` | `/es/imprimir-misma-foto-varias-veces` | `/en/print-same-picture-multiple-times` |
| `actual-size` | `/es/imprimir-imagen-tamano-real` | `/en/print-image-actual-size` |
| `stickers` | `/es/hacer-stickers-en-casa` | `/en/print-stickers-at-home` |
| `faq` | `/es/preguntas-frecuentes` | `/en/faq` |
| `legal-terms`, `legal-privacy` | `/es/terminos`, `/es/privacidad` | `/en/terms`, `/en/privacy` |
| `legal-notices`, `legal-license` | `/es/licencias-de-terceros`, `/es/licencia` | `/en/third-party-licenses`, `/en/license` |

Hindi's addresses are English words, the ones people in India type when
they search this in Latin letters («multiple photos in one page print»,
«passport size photo a4 sheet»): the Hindi part of their Hinglish searches
has no settled spelling.

| Page (id) | Hindi |
| --- | --- |
| `several-photos` | `/hi/print-multiple-photos-in-one-page` |
| `how-many` (calculator) | `/hi/how-many-photos-in-a4-sheet` |
| `photos-10x15` | `/hi/print-4x6-photos-on-a4` |
| `id-photos` | `/hi/passport-size-photo-a4-sheet` |
| `same-photo` | `/hi/print-same-photo-multiple-times` |
| `actual-size` | `/hi/print-image-actual-size-in-cm` |
| `stickers` | `/hi/print-stickers-at-home` |
| `faq` | `/hi/faq` |
| `legal-terms`, `legal-privacy` | `/hi/terms`, `/hi/privacy` |
| `legal-notices`, `legal-license` | `/hi/third-party-licenses`, `/hi/license` |

Simplified Chinese's addresses are short English words too: in mainland
China this is searched in characters, nobody types pinyin, and the address
weighs little next to the title. French's are French without accents.

| Page (id) | Simplified Chinese | French |
| --- | --- | --- |
| `several-photos` | `/zh-hans/multiple-photos-on-one-sheet` | `/fr/imprimer-plusieurs-photos-sur-une-feuille` |
| `how-many` (calculator) | `/zh-hans/photos-per-sheet-calculator` | `/fr/combien-de-photos-sur-une-feuille` |
| `photos-10x15` | `/zh-hans/6-inch-photos-on-a4` | `/fr/imprimer-photos-10x15-sur-a4` |
| `id-photos` | `/zh-hans/id-photo-layout` | `/fr/photo-identite-a-imprimer` |
| `same-photo` | `/zh-hans/same-photo-multiple-copies` | `/fr/imprimer-plusieurs-fois-la-meme-photo` |
| `actual-size` | `/zh-hans/print-image-actual-size` | `/fr/imprimer-image-taille-reelle` |
| `stickers` | `/zh-hans/print-stickers` | `/fr/faire-ses-stickers-soi-meme` |
| `faq` | `/zh-hans/faq` | `/fr/questions-frequentes` |
| `legal-terms`, `legal-privacy` | `/zh-hans/terms`, `/zh-hans/privacy` | `/fr/conditions-utilisation`, `/fr/confidentialite` |
| `legal-notices`, `legal-license` | `/zh-hans/third-party-licenses`, `/zh-hans/license` | `/fr/licences-tierces`, `/fr/licence` |

- **Addresses don't change** once published: search engines may have them,
  and the editor links to the terms and the privacy policy of the language
  it shows (`src/site/links.ts`, from each language's `paths.ts`;
  `tests/site/editor-links.test.ts` checks the site builds them). If one has
  to change, add a redirect in `vercel.json`. They are lowercase ASCII
  letters, digits and hyphens (`tests/site/languages.test.ts`), so they never
  need encoding.
- **`/` is the editor**, whatever the language, and `404.html` (any missing
  address) is Spanish.
- **The same page in every language shares its id.** Its indexable versions
  link to each other in their `<head>` and in the sitemap (`hreflang`, plus
  `x-default`: the English version, or the Spanish one if there is none),
  and every version, indexed or not, links to the others at the foot of the
  page, each named in its own language («Español», «English»): plain links,
  no script.
- **No fallback.** A language without a page simply has no such page and no
  link to it; nothing shows Spanish text under another language's address.
  Each page says its language (`<html lang>`), and its structured data
  (questions, breadcrumb) is in it. A page's links stay in its language;
  only the links between versions, and a translated legal page's link to
  its Spanish reference, go to another language, and they say so with
  `hreflang`.
- **`llms.txt`** starts with what the tool is (in Spanish), then lists each
  language's guides, questions and final legal pages, under headings in
  that language.
- **The buttons that open the editor carry no language**: deep links
  ([deep-links.md](deep-links.md)) have no language parameter, so the
  editor opens in the language chosen in «Preferencias» or, on
  «Automático», the browser's. Someone reading the English pages with an
  English browser gets the editor in English.
- **Fonts.** Every page is set in Inter, as the editor is, with each
  language's own fonts behind it («Fonts» below). Chinese and Devanagari,
  which Inter doesn't have, are left to the system's fonts: Windows
  (Microsoft YaHei, Nirmala UI), macOS and iOS (PingFang SC, Kohinoor
  Devanagari) and Android (Noto) have them. In Playwright's Docker image,
  Chromium, Firefox and WebKit render both scripts with its fallback fonts
  (FreeSans, WenQuanYi Zen Hei), conjuncts included; a Linux system without
  any Devanagari or Chinese font shows boxes. `<html lang="zh-Hans">` lets the
  browser choose simplified glyphs.

### Fonts

The pages use the editor's Inter (`src/site/fonts.ts`), so the site and the
editor read as one product and going from one to the other downloads no font
twice:

- **The editor's files.** The plugin reads the stylesheet `src/styles/index.css`
  imports (`@fontsource-variable/inter`: one `@font-face` per subset, Latin,
  Latin Extended, Cyrillic, Greek, Vietnamese…, each with its
  `unicode-range`) and, in a build, the address Vite gave each file for the
  editor (`assets/inter-latin-wght-normal-[hash].woff2`); `yarn dev` serves
  them from `node_modules`, as it serves the editor's. Nothing comes from
  another server, and there is no second copy of the font.
- **Only what the page draws.** Each page carries the `@font-face` rules of
  the subsets whose characters its text uses (its text, a stacked table's
  column names, the calculator's texts, the breadcrumb's «›») and preloads
  them (`<link rel="preload" as="font" crossorigin>`), so the font starts
  downloading with the page. Today that is Latin alone on every page, in
  every language: French «œ» and its capitals with accents are in it, and
  Chinese and Devanagari are in no subset of Inter. A page that needs a
  subset the build didn't emit stops the build.
- **Nothing moves when it arrives.** `font-display: swap`, as in the editor:
  the text shows at once in a fallback and Inter takes its place when it
  arrives. The fallback is a system font resized to Inter's measure
  (`FALLBACK_FACES`: `size-adjust` and `ascent-override`, `descent-override`,
  `line-gap-override`), so lines keep their length and their baseline: Arial
  on Windows, macOS and iOS (and its metric clones Liberation Sans, Arimo and
  Nimbus Sans on Linux and ChromeOS), Roboto on Android, each in regular and
  bold. San Francisco and Segoe UI aren't used: Safari doesn't let `local()`
  reach San Francisco, and both systems have Arial. `optional` would leave
  slow first visits in the fallback for the whole page, and `block` would
  hide the text for up to 3 s. The comment above `FALLBACK_FACES` says how
  the numbers were worked out; `tests/site/fonts.test.ts` reads Inter's
  metrics from its file and fails if a new version of the package changes
  them (then work the numbers out again).
- **Measured** on Slow 3G (Chromium, 2 s latency, 50 kB/s; Inter arrives
  about 3 s after the text shows), layout shift after Inter arrives, where
  system fonts gave 0: with the resized fallback, 0 on the FAQ and the
  10 × 15 guide at 390 and 1440 px, 0.028 on the longest page (the
  third-party licenses) at 390 px and 0 at 1440 px, 0 on the Chinese and
  Hindi guides and 0.01 on the Hindi FAQ at 390 px; without it, 0.17 and
  0.07 on the licenses and 0.02 on the 10 × 15 guide. A paragraph can
  still break one word differently: the faces match Inter's widths on
  average (within 0.3 % for regular and bold text), not letter by letter.
- **Each language's fonts behind Inter**, as `src/styles/tokens.css` gives
  them: Chinese, PingFang SC, Microsoft YaHei, Noto Sans CJK SC; Hindi, the
  system's Devanagari font (Nirmala UI, Kohinoor Devanagari, Noto Sans
  Devanagari). Unlike the editor, the Hindi pages don't download Noto Sans
  Devanagari: it weighs 121 kB, twice what a Hindi guide downloads with
  Inter (about 56 kB); it would arrive after Inter and move the whole text
  when it swapped in (0.08 measured on the Hindi FAQ on a Windows-like
  system); and every system Hindi readers use has a Devanagari font,
  Android's being that same Noto Sans Devanagari. Latin letters and digits
  in those pages are Inter's.
- **The editor's rendering**: the same weights (500 to 800, from the
  variable font: none is synthesized), tabular numbers in tables, the
  editor's font smoothing. The files have no optical size axis, so
  `font-optical-sizing` changes nothing, as in the editor. Code stays in the
  system's monospace font.
- **Bytes.** The `@font-face` rules, the preload and the fallback faces add
  about 0.6 kB (gzip) to each page; the first visit to a page downloads
  Inter's Latin file too, 48.3 kB, which the editor then has in its cache.
  `yarn size` checks each page's HTML (`pages`) and its first visit: HTML,
  fonts and scripts, against `pageFirstVisit`.

### How a page is built

A page is the same facts in other words:

- **Facts**, in `src/site/facts/<page>.ts`, once for every language: the
  layouts the buttons open (`editorHref`), every count and drawing (worked
  out with the real packer: `capacity`, `sheetFigure`), the rows of the
  tables. A sentence that relies on a particular count checks it with
  `expect(...)`, so the build stops if the packer ever says otherwise. The
  stickers guide draws its sheet with `shapesFigure`: a few shapes, each
  traced once by the app's own tracer (`core/contour.js`, from a mask the
  facts draw) with the cut margin it states, where the packer puts them.
- **Words**, in `src/site/content/<language>/<page>.ts`: a function that
  takes the language's kit (`createKit`, `src/site/kit.ts`) and returns the
  page (`guide({...})`, `src/site/guide.ts`). The kit writes everything that
  isn't a plain word: `ui('bar.arrange')` and the like (the app's own names,
  from that language's catalogue in `src/copy`, so a renamed button renames
  it in the guides), `paperName` and `photoName` (also `{ turned: true }`:
  «15 × 10»), `num`, `mm` and `size(w, h, 'mm' | 'cm' | 'in')` (numbers as
  that language writes them, a no-break space before the unit, never a
  thousands separator), and `list`.
- **Legal documents**: the terms and the privacy policy are written in
  Spanish (`docs/legal/terminos.md`, `privacidad.md`, the reference) and
  translated in `docs/legal/<language>/terms.md` and `privacy.md`;
  `LICENSE` and `THIRD_PARTY_NOTICES.md` are English, the same file for every
  language, with an introduction in the page's language
  (`src/site/legal-page.ts`).

`tests/site/languages.test.ts` compares every page of another language with
its Spanish version and fails when they differ in:

- **structure**: the kind of page, its blocks in order (headings, steps and
  how many, tables and their size, notes, figures, the calculator, the
  buttons, how many questions; paragraphs in a row count as one), the
  numbers in its tables, what its figures draw, the links that open the
  editor (exactly the same, in order), where its other links go (the same
  pages), its external links and its placeholders;
- **numbers and measures**: building the pages in probe mode, each number,
  measure, paper and photo name the kit writes becomes a mark of its fact
  («⟦mm:5⟧», «⟦size:101.6×152.4⟧», «⟦photo:10x15⟧»; inches and centimeters
  in millimeters). The set of facts must be the Spanish page's, and so must
  the set of numbers typed by hand (read with the language's decimal
  separator: the Spanish pages type «100 %» for the print dialog, «4 × 4»
  and «4» in two questions, «1.0.0» in the license's name);
- **the calculator**: the same form (fields, limits, options), texts with
  the same parameters, and the same answers for a set of forms.

A copy of a Spanish page with one thing changed fails each comparison (the
test's last group checks that).

## Before publishing

| Variable | What it is |
| --- | --- |
| `SITE_URL` | The public address, just the origin (`https://example.com`). Canonical URLs, the sitemap, `llms.txt` and the share tags use it. Unset, they point to `https://scooch.invalid`. |
| `VERCEL_ENV` | Vercel sets it to `production` on production deployments: that build is a **release**. Set it yourself to try a release locally. |
| `SCOOCH_ALLOW_DRAFT` | `1` lets a release go out anyway, as a draft. |

A release **stops** with a list of what is missing while `SITE_URL` is
unset or invalid. It also stops if a legal text (`docs/legal/terminos.md`,
`docs/legal/privacidad.md`, their translations in `docs/legal/<language>/`,
`LICENSE`) has a placeholder again (words in capitals between angle
brackets, as the drafts had for the owner's name, the contact, the law and
the date) or a draft note (a paragraph starting with the language's
`LEGAL_MARKERS.draft`: «_Borrador.», «_Draft.»…). The texts have neither
today, so only `SITE_URL` is left for the host to set. Any other build
(local, CI, Vercel previews, the e2e suite) warns and goes on. A legal page
with a placeholder or a draft note carries `noindex` and stays out of the
sitemap and `llms.txt`; the final ones are indexed like the other pages.

A translation follows the Spanish text, the owner's details included, and
starts with one sentence saying that the Spanish version prevails if they
differ ([legal/README.md](legal/README.md)).

The variables can also go in a `.env.local` file, which Vite reads (don't
commit it).

`src/site/share.png` is the image shown when a page is shared: `share.svg`
rendered at 1200 × 630 with the Inter font.

## Adding a content page

1. Its id goes in `PAGE_IDS` (`src/site/types.ts`) and its facts in
   `src/site/facts/<id>.ts`.
2. Write it in Spanish in `src/site/content/es/<id>.ts`, like the others,
   with its address in `content/es/paths.ts` and the function in
   `content/es/index.ts`. Every language's `paths.ts` needs its address
   (the typecheck says so); write the page in each language too (see
   «Adding a language» for the rules), or leave it out of that language's
   `pages` until it is translated: that language then simply has no such
   page.
3. One intent per page, the answer first (`lead`), and buttons that open the
   editor set up (`editorHref`, see [deep-links.md](deep-links.md)).
4. Name buttons and options with `ui(...)`; papers and photo sizes with
   `paperName` and `photoName`; numbers and measures with `num`, `mm` and
   `size`. Never type a count by hand.
5. Questions go in `faq`: they show at the end and become `FAQPage` data.
6. Follow [copy.md](copy.md). `tests/site/pages.test.ts` checks every page
   (one `<h1>`, title, description, canonical, structured data, links,
   nothing of the editor, each language's copy rules) and every editor link
   it carries.

## Adding a language

A language is files: its content folder, its two legal translations and an
entry in a few lists. Spanish is the reference for what a page says;
English is the model for the files (Spanish also has the error page and the
editor's metadata, which no other language needs).

1. **Read** the app's glossary for the language (`docs/copy/<lang>.md`) and
   its catalogue (`src/copy/<lang>.ts`): the pages use the same terms, and
   name the app's buttons through `ui(...)`, never by hand. Read
   [copy.md](copy.md) for the voice, and the Spanish pages
   (`src/site/content/es`) for what each one says.
2. **Copy `src/site/content/en/` to `src/site/content/<lang>/`** and
   translate each file:

   | File | What it has |
   | --- | --- |
   | `paths.ts` | One address per page id, under `/<lang in lowercase>/`: lowercase ASCII letters, digits and hyphens, with the words people search for. A language in another script writes them in Latin letters: the words people type in that market if they search in Latin letters (much of India searches this in English or romanized Hindi: «passport-size-photo»), otherwise short English words (the address weighs little next to the title). |
   | `index.ts` | The `SiteLanguage`: `lang`, `units` (what follows a measure: `mm`, `cm` and the word for inches; the kit puts a no-break space before it, so a language that writes no space before a unit word, like Chinese 厘米, uses the symbols, as its catalogue's measures do), `paths`, `legalMarkers`, `chrome`, `llms`, `pages` (same order as Spanish). |
   | `chrome.ts` | The frame: skip link, header button, breadcrumb label, footer headings (`languages` heads the links to other languages), the line about the tool, the questions' heading, the share image's description, the legal links' labels (the terms and the privacy policy by the catalogue's names, `ui('legal.terms')` and `ui('legal.privacy')`, as the editor names them; the two license pages typed); the sentences listing papers and photo sizes; the headings of `llms.txt`. |
   | `several-photos.ts`, `how-many.ts`, `photos-10x15.ts`, `id-photos.ts`, `same-photo.ts`, `actual-size.ts`, `stickers.ts`, `faq.ts` | One per page. `how-many.ts` also has the calculator's texts (`calcTexts`: `locale` is the catalogue's `meta.numberLocale`; `count` and `figure` are plural forms chosen by the language's rules, so a language with a single form gives `one` and `other` the same text; `count` is shown under the number, on a line of its own; `noteSame.one` is for exactly one copy) and its labels. The calculator joins its pieces (the count and its words, the paper and its orientation, a note and the cap) with a space, or with none next to Chinese (`joinWords`, `src/site/html.ts`). |
   | `legal.ts` | The legal pages' titles (the terms and the privacy policy by the catalogue's names, as in `chrome.ts`), descriptions and the license texts' introductions; `LEGAL_MARKERS`, the words publishing looks for: how a draft note would start in the language (a paragraph starting with it stops a release), the analytics heading, and the word a reminder for maintainers there would start with (a section holding only such a reminder is left out of the page). |

   Write the files in Unicode NFC, as the catalogues are: a nukta letter
   typed precomposed (U+095E) isn't the catalogue's «फ़» (फ + ़), so a
   `replace` on an app name finds nothing. A measure typed by hand takes a
   no-break space before its unit (U+00A0), as the kit's do. Where the
   catalogue's photo size names write a unit as a word, `units` uses that
   word, so a measure reads like the names next to it (Hindi «सेमी»,
   «इंच»). The word an analytics reminder would start with (`LEGAL_MARKERS`)
   must be one the policy doesn't use: the published policy must not
   contain it.

3. **Translate the legal texts** from Spanish into
   `docs/legal/<lang>/terms.md` and `privacy.md`, faithfully, like
   `docs/legal/en/`: the same headings and lists in the same order, the
   owner's details as the Spanish gives them, the effective date in the
   language's long form (as `Intl.DateTimeFormat` writes it with
   `dateStyle: 'long'`: the comparison reads it as one date), a first
   sentence saying that if the translation and the Spanish version
   (`../terminos.md`, `../privacidad.md`) differ, the Spanish version
   prevails, links to `terms.md`, `privacy.md`, `../../../LICENSE` and
   `../../../THIRD_PARTY_NOTICES.md`, in-page links to the translated
   headings' ids, and the app's names for what the policy lists (its
   catalogue's). Don't translate `LICENSE`, `LICENSE-EXCEPTION.md` or
   `THIRD_PARTY_NOTICES.md`.
   The site's Markdown joins the lines of a paragraph or a list item with a
   space, or with none where either side is Chinese, so a Chinese text
   breaks its lines next to a Chinese character. Italics (`_nosotros_`) need
   a space or punctuation around them: Chinese marks such a term with “ ”
   instead.
4. **Register it** in `src/site/content/index.ts`.
5. **Add its entries** where the tests and budgets list languages:
   - `tests/site/pages.test.ts`: `COPY_RULES` (what its glossary forbids
     that a machine can see: exclamations, the wrong quotes, a space where
     there must be none, a number and unit that can break apart, words the
     glossary replaces) and `NO_CLAIMS` (words that would call a document
     photo size the usual one, or name a country, on the photo ID guide;
     it reads the whole `<main>`, the questions' heading included, so a
     word like Chinese 常见, “common”, needs to leave out 常见问题, “FAQ”).
     In JavaScript `\b` only knows ASCII letters: in a language with
     accents or another script it cuts words apart («prêtes» holds «tes»),
     so mark whole words with `(?<!\p{L})…(?!\p{L})` and the `u` flag. The
     rules read each page's body: check its title and description, and the
     calculator's texts that only show once it is used, by eye. Devanagari's vowel signs are
     marks, not letters: where a boundary matters there, use `\p{M}` with
     `\p{L}`;
   - `tests/site/legal.test.ts`: `POLICY` (the heading of the policy's list
     of what is stored, the sentences that say there is no analytics, in
     what it doesn't do and at the start of its analytics section, and the
     bold term of each stored key). The test looks for `**term:**`,
     with `:` or Chinese `：` inside the bold (`- **单位：**`): a language
     that writes something before the colon (French, a no-break space:
     `**Unités :**`) ends each term with it;
   - `tests/site/table.test.ts`: its photos-10x15 page and third-party
     licenses page, which carry the stacked-table CSS;
   - `e2e/specs/site-pages.spec.ts`: its pages in `SHOWN`, and a guide in
     `GUIDES`;
   - `src/site/styles.ts`: if Inter doesn't have its script, its fonts behind
     Inter (`:root:lang(…)`), as `src/styles/tokens.css` gives them; if its
     text needs another subset of Inter than Latin (Vietnamese, Cyrillic,
     Latin Extended for Polish or Turkish…), the pages declare and preload it
     on their own, but `tests/site/fonts.test.ts` expects Latin alone and
     `pageFirstVisit` in `scripts/size-budgets.json` may need the subset's
     weight: say so where you change them;
   - `scripts/size-budgets.json`: its privacy policy, third-party
     licenses and stickers guide, which are over the budget for any page (and any other page
     `yarn size` finds over it or right at it: a script that takes three
     bytes a letter in UTF-8, like Devanagari, puts the calculator and the
     terms there too);
   - the docs: the languages with content and their addresses under
     «Languages» above, and the translations in
     [legal/README.md](legal/README.md) and [copy.md](copy.md).
6. **Keep what the pages say true in every language:**
   - The photo ID guide names no country and calls no size the usual one:
     it tells readers to check the requirement of the office that asks for
     the photo. Keep that in every language.
   - The stickers guide names no cutting machine, paper or printer and
     claims no machine can use the PDF: it says what the PDF has (each
     contour as a vector stroke on the page, with no layer of its own and no
     registration marks), that the app was tested with no machine, and that
     the line is meant for cutting by hand. Keep that in every language.
   - Numbers and measures come from the kit; a translation types by hand
     only what the Spanish page types (above). Measures stay in millimeters,
     as the editor shows them; inches appear only where the size really is
     an inch size (the photo sizes' names come from the catalogue: «4 × 6 in»,
     «6寸»). Don't convert sizes.
   - Where the Spanish page writes a paper's name as a word (Carta and
     Oficio in its descriptions and buttons), name it with
     `ui('papers.names.letter')`, not `paperName`: the comparison counts
     `paperName` as a fact the Spanish page doesn't have, while interface
     names are words, and the name still comes from the catalogue.
   - The print dialog's options are quoted as that language's browsers name
     them (Spanish «Tamaño real», «100 %»; English “Actual size”, “100%”;
     Chinese “实际大小”, “100%”, as the app's print tip says).
   - Titles up to 65 characters, descriptions 70 to 160. The test counts
     characters, so a Chinese description needs about twice what an English
     one says to reach 70.
   - A measure never breaks (the kit's no-break spaces): in a table's first
     column, what goes around it must still fit a phone, which the e2e spec
     checks at 390 px with wider letters. Full-width parentheses around a
     measure don't: the Chinese tables write the app's «6寸 · 101.6 × 152.4 mm».
7. **Run the checks:**

   ```sh
   yarn typecheck
   node_modules/.bin/vitest run tests/site
   yarn build && yarn size
   node_modules/.bin/playwright test e2e/specs/site-pages.spec.ts --project=chromium
   yarn dev   # and read every page: /<lang>/…
   ```

   When the comparison fails, its diff says what differs from the Spanish
   page: a block, a table's number, a link, or a fact or typed number that
   one side has and the other doesn't. Fix the translation, not the facts.
   Then `yarn verify`, and the WebKit and Firefox `app` groups
   ([testing.md](testing.md)).

   A machine without a font for the language's script (`fc-list :lang=hi`
   prints nothing) shows boxes: the browser checks still pass, but they
   measure the boxes. Look at the headings, buttons and tables where the
   script has a font (any phone, or Playwright's Docker image).
8. **Leave a review sheet** for a native speaker (`review-site-<lang>.md`,
   where the owner asks; the English one is `review-site-en.md`), like the
   app's translators did: the address and the search words chosen for each
   page and why, the decisions (terms, tone, what was adapted rather than
   translated), and a table of doubts (page, current text, doubt). The
   pages are machine-checked for structure and numbers, not for language:
   until a native speaker reviews them, say so in your report.
