# Legal page drafts

Drafts of the site's legal pages, in Spanish:

- [terminos.md](terminos.md): terms of use and disclaimer.
- [privacidad.md](privacidad.md): privacy policy.

They will become pages of the site and be translated later. **Spanish is the
reference version**: translations follow it.

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

The privacy policy's Analítica section is a placeholder too: there are no
analytics today. Rewrite it before any analytics are turned on. While it only
holds the PENDIENTE note, the published page leaves the section out («Lo que
no hacemos» already says there are no analytics).

Before publishing, also remove the draft note. `LICENSE`'s
`<COPYRIGHT HOLDER>` is a placeholder too.

## Publishing

The site publishes both texts as pages (`/es/terminos` and `/es/privacidad`),
with `LICENSE` and `THIRD_PARTY_NOTICES.md` (`/es/licencia` and
`/es/licencias-de-terceros`); [docs/site.md](../site.md) explains how. The
HTML comment is left out of the pages, and links between the documents point
to their pages. While a placeholder or the draft note is there, the page is
kept out of search engines, and a production deployment stops (unless
`SCOOCH_ALLOW_DRAFT=1`).

## Keep them true

The privacy policy describes what the code does today. Check it again, and
update the effective date, whenever one of these changes:

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
dispositivo: a new key needs its item there, and its term in the test's
`POLICY_TERMS`. What lives in IndexedDB isn't checked that way.

The links to Vercel's and Patreon's privacy policies were checked on
2026-11-13.
