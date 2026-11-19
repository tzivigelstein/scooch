# Legal page drafts

Drafts of the site's legal pages, in Spanish:

- [terminos.md](terminos.md): terms of use and disclaimer.
- [privacidad.md](privacidad.md): privacy policy.

**Spanish is the reference version**: translations follow it. Each language
of the site has its translation in a folder of its own, with the same file
names in every language: [en/terms.md](en/terms.md) and
[en/privacy.md](en/privacy.md), and the same two files under
[zh-Hans/](zh-Hans/), [hi/](hi/) and [fr/](fr/). A translation keeps the Spanish
placeholders, translates the draft note and says the Spanish version is the
reference until a lawyer reviews it.

They are drafts, not legal advice. A lawyer has to review them before they are
published or relied on.

## Placeholders

Each file lists its placeholders in an HTML comment at the top. In the text
they are wrapped in inline code (a bare `<TITULAR>` would be read as an HTML
tag and not show up), so replace them together with their backticks.

| Placeholder | Meaning | In |
| --- | --- | --- |
| `<TITULAR>` | Person or entity offering the app | both |
| `<CORREO DE CONTACTO>` | Contact email | both |
| `<PAÍS / JURISDICCIÓN>` | Governing law and, if needed, courts | terms |
| `<FECHA DE VIGENCIA>` | Date this version takes effect | both |

The privacy policy's Analítica section says there are no analytics, and that
the policy will say so before that changes. Before any analytics tool is
turned on, rewrite that section in every language: which tool, what data it
collects and what for, whether it uses cookies or other identifiers, who
processes the data and where, how long it is kept and how to turn it off.
Update «Lo que no hacemos» and the effective date too, and publish the new
policy before the tool goes live.

Before publishing, also remove the draft note. `LICENSE`'s
`<COPYRIGHT HOLDER>` is a placeholder too.

## Publishing

The site publishes both texts as pages (`/es/terminos` and `/es/privacidad`;
in English, `/en/terms` and `/en/privacy`), with `LICENSE` and
`THIRD_PARTY_NOTICES.md` (`/es/licencia` and `/es/licencias-de-terceros`;
`/en/license` and `/en/third-party-licenses`), which stay in English in every
language; [docs/site.md](../site.md) explains how, and lists each language's
addresses (Hindi: `/hi/terms`, `/hi/privacy`). The
HTML comment is left out of the pages, and links between the documents point
to their pages. While a placeholder or the draft note is there, the page is
kept out of search engines, and a production deployment stops (unless
`SCOOCH_ALLOW_DRAFT=1`).

## Keep them true

The privacy policy describes what the code does today. Check it again, and
update the effective date, whenever one of these changes; then make the same
change in every translation:

| What changes | Where to look | What to update |
| --- | --- | --- |
| Anything saved in the browser | `src/state/settings.ts` (every setting and where it lives), `src/config.ts` (storage keys), `src/services/storage/` (the IndexedDB stores), `src/services/projects.ts`, `src/state/prefs.ts`, `src/state/view.ts`, `src/state/savings.ts` | privacy: Qué se guarda en tu dispositivo, Cómo borrar estos datos |
| Any request to another server (fonts, CDNs, error reporting) | `index.html`, `src/` | privacy: Lo que no hacemos, Otros servicios |
| Analytics | | privacy: Analítica, Lo que no hacemos |
| The donation link | `DONATE_URL` in `src/config.ts` (empty today, so the summary after printing never asks for a donation) | privacy: Aportes; terms: sections 7 and 9 |
| Hosting, or hosting features that add scripts, cookies or logs (analytics, toolbars, firewall challenges, log drains) | the hosting provider's dashboard: not visible in the repository | privacy: Alojamiento, Lo que no hacemos |
| Photo size presets | `src/core/crop.js`, `src/copy/es.ts` | terms: section 5 |
| The license | `LICENSE` | terms: section 8 |
| The app's name | `APP_NAME` in `src/config.ts` | both: the drafts write the name, Scooch, as text |

`tests/site/legal.test.ts` fails when a localStorage key of the settings
registry (`src/state/settings.ts`) has no item in Qué se guarda en tu
dispositivo, or in the same section of a translation: a new key needs its
item in every policy, and its term in the test's `POLICY`, for each
language. What lives in IndexedDB isn't checked that way.

The links to Vercel's and Patreon's privacy policies were checked on
2026-11-13.
