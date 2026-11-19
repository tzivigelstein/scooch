# Legal texts

The site's legal texts, in Spanish:

- [terminos.md](terminos.md): terms of use and disclaimer.
- [privacidad.md](privacidad.md): privacy policy.

**Spanish is the reference version**: translations follow it. Each language
of the site has its translation in a folder of its own, with the same file
names in every language: [en/terms.md](en/terms.md) and
[en/privacy.md](en/privacy.md), and the same two files under
[zh-Hans/](zh-Hans/), [hi/](hi/) and [fr/](fr/). Each translation starts with
one sentence saying that, if it and the Spanish version differ, the Spanish
version prevails.

Next to them, at the root of the repository:

- [LICENSE](../../LICENSE): the PolyForm Noncommercial License 1.0.0, its text
  as published. Only the `Required Notice:` line above it is ours: it names the
  copyright holder.
- [LICENSE-EXCEPTION.md](../../LICENSE-EXCEPTION.md): the licensor's
  additional permission to use the app at its official site for any purpose,
  commercial ones included.
- [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md): the licenses of what
  the build ships.
- [SECURITY.md](../../SECURITY.md): where to report a security problem.

## What the owner decided

The texts put these decisions of the owner into words:

- **Who.** Tzivi Santiago Gelstein offers Scooch, as an individual in
  Argentina publishing a personal, free project: no company, tax id or postal
  address. He is the copyright holder in `LICENSE`.
- **Contact.** One email address, his, only where a contact belongs: the
  terms (section 12), the privacy policy (Quién es responsable, Contacto) and
  `SECURITY.md`.
- **Law.** The terms are governed by Argentine law (section 11). No courts are
  named.
- **Date.** This version takes effect on 19 November 2026.
- **Commercial use.** What people make with Scooch is theirs to sell; Scooch
  itself is not to be commercialised. PolyForm Noncommercial alone allows
  noncommercial purposes only, so the permission for commercial work at the
  official site is a separate grant from the licensor, in
  `LICENSE-EXCEPTION.md`: the license text can't be changed, and the grant
  must not reach copies hosted by anyone else. The terms say it in section 7
  and say what stays forbidden in section 8; README's License section, the
  questions page and the code license page's introduction say it too.

## Not reviewed by a lawyer

Nobody with legal training has reviewed these texts or the permission in
`LICENSE-EXCEPTION.md`. They were written from the owner's decisions, in plain
words, and checked against what the code does, nothing more. The published
pages don't say this, and must not claim a review that didn't happen. If a
lawyer reviews them, record here who did, when, and which version.

## Changing them

1. Change the Spanish text, then make the same change in every translation:
   the same headings, lists and links in the same order
   (`tests/site/languages.test.ts` compares each translated page with the
   Spanish one, numbers and dates included).
2. Update the effective date in every file, in each language's long form
   («19 de noviembre de 2026», «November 19, 2026», «19 novembre 2026»,
   «19 नवंबर 2026», «2026年11月19日»). The comparison reads a date written that
   way as one date, so a translation with another date fails.
3. Write the app's name, Scooch, as text.
4. Keep notes for whoever edits the texts here, not in them: the site
   publishes the files as they are, dropping only HTML comments.

## Publishing

The site publishes both texts as pages (`/es/terminos` and `/es/privacidad`;
in English, `/en/terms` and `/en/privacy`), with `LICENSE` and
`THIRD_PARTY_NOTICES.md` (`/es/licencia` and `/es/licencias-de-terceros`;
`/en/license` and `/en/third-party-licenses`), which stay in English in every
language; [docs/site.md](../site.md) explains how, and lists each language's
addresses (Hindi: `/hi/terms`, `/hi/privacy`). Links between the documents
point to their pages. `LICENSE-EXCEPTION.md` has no page: the terms give the
same permission and name the file.

The terms and the privacy policy are final, so their pages are indexed like
the rest of the site, and listed in the sitemap and `llms.txt`. The check
that kept the drafts out is still there: if a placeholder (words in capitals
between angle brackets, as the drafts had for the owner's name, the contact,
the law and the date) or a draft note (a paragraph starting with the
language's `LEGAL_MARKERS.draft`, such as «_Borrador.») comes back, that page gets
`noindex` and leaves the sitemap, and a production deployment stops unless
`SCOOCH_ALLOW_DRAFT=1`.

## Keep them true

The privacy policy describes what the code does today. Check it again, and
update the effective date, whenever one of these changes; then make the same
change in every translation:

| What changes | Where to look | What to update |
| --- | --- | --- |
| Anything saved in the browser | `src/state/settings.ts` (every setting and where it lives), `src/config.ts` (storage keys), `src/services/storage/` (the IndexedDB stores), `src/services/projects.ts`, `src/state/prefs.ts`, `src/state/view.ts`, `src/state/savings.ts` | privacy: Qué se guarda en tu dispositivo, Cómo borrar estos datos |
| Any request to another server (fonts, CDNs, error reporting) | `index.html`, `src/` | privacy: Lo que no hacemos, Otros servicios |
| Analytics | | privacy: Analítica, Lo que no hacemos (see below) |
| The donation link | `DONATE_URL` in `src/config.ts` (empty today, so the summary after printing never asks for a donation) | privacy: Aportes; terms: sections 7 and 9 |
| Hosting, or hosting features that add scripts, cookies or logs (analytics, toolbars, firewall challenges, log drains) | the hosting provider's dashboard: not visible in the repository | privacy: Alojamiento (the provider's name and the link to its privacy policy are one line in each language: «Hoy ese proveedor es Vercel…»), Lo que no hacemos |
| Photo size presets | `src/core/crop.js`, `src/copy/es.ts` | terms: section 5 |
| The license, or the permission for the official site | `LICENSE`, `LICENSE-EXCEPTION.md` | terms: sections 7 and 8; README: License; the questions page (`faq.ts` of each language); the code license page's introduction (`legal.ts` of each language) |
| The owner, the contact or the governing law | | terms: sections 1, 11 and 12; privacy: Quién es responsable, Contacto; `LICENSE` (Required Notice); `SECURITY.md` |
| The app's name | `APP_NAME` in `src/config.ts` | both: they write the name, Scooch, as text |

The privacy policy's Analítica section says there are no analytics, and that
the policy will say so before that changes. Before any analytics tool is
turned on, rewrite that section in every language: which tool, what data it
collects and what for, whether it uses cookies or other identifiers, who
processes the data and where, how long it is kept and how to turn it off.
Update «Lo que no hacemos» and the effective date too, and publish the new
policy before the tool goes live.

`tests/site/legal.test.ts` fails when a localStorage key of the settings
registry (`src/state/settings.ts`) has no item in Qué se guarda en tu
dispositivo, or in the same section of a translation: a new key needs its
item in every policy, and its term in the test's `POLICY`, for each
language. What lives in IndexedDB isn't checked that way. The same test
checks that every policy still says there are no analytics.

The links to Vercel's and Patreon's privacy policies were checked on
2026-11-13. Vercel's brand guidelines (vercel.com/geist/brands, read on
2026-11-19) ask material that uses the Vercel marks to carry an attribution
statement («Vercel, the Vercel design, Next.js and related marks, designs and
logos are trademarks or registered trademarks of Vercel, Inc. or its
affiliates in the US and other countries»). The policy only names Vercel as a
fact, as the guidelines allow, without that statement: adding it is the
owner's call.
