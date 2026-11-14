# Deep links

A link to the editor can carry parameters that set up a **new project**:
`/?paper=A4&margin=5&gap=2&photo=passport-35x45&cuts=outline`. The content
pages use them for their buttons; anyone can write one.

| Parameter | Values | Sets |
| --- | --- | --- |
| `paper` | a paper id of `src/core/papers.js` (`A4`, `letter`, `legal`, `photo-10x15`…; any case), `carta`, `oficio`, `tabloide`, or a custom size `216x330mm` (20–2000 mm a side) | the paper (a custom size also sets the orientation) |
| `orientation` | `portrait` or `landscape` (also `vertical`, `horizontal`) | the orientation |
| `margin` | mm, `5` or `2.5` (or `2,5`), clamped to 0–50 | the margin; ignored if it leaves no printable area on the paper |
| `gap` | mm, clamped to 0–50 | the gap between pieces |
| `photo` | a photo size id of `src/core/crop.js` (`10x15`, `id-4x4`, `passport-35x45`, `visa-5x5`…), or a custom size `25x30mm` (5–1000 mm a side) | the size the images added to that project get (cropped to fill it, turned like each image); PDF pages keep theirs |
| `cuts` | `none`, `corners` or `outline` | the cut lines |
| `rotate` | `on` or `off` (also `1`/`0`, `true`/`false`) | «Rotación automática» |

The parser is `parseDeepLink` in `src/core/deeplink.js` (tested in
`tests/core/deeplink.test.js`); `deepLinkSearch` builds a link from the same
values.

## What a link does

- Each value is checked on its own: an unknown or unreadable one is ignored,
  a number out of range is clamped, and the rest still applies. Parameters
  that aren't the ones above (`utm_source`…) are left alone.
- If at least one value could be read, the app **creates a new project**
  with those settings (the rest are the defaults) instead of restoring the
  last one. No saved project is opened or changed, so a project another tab
  has open stays there; the last project's unsaved journal waits until it is
  opened again. A notice says that a new project was created, and with which
  paper and photo size.
- The parameters are taken out of the address right away, so a reload opens
  the project the link created instead of creating another.
- The photo size applies to images added to that project while this tab has
  it open; opening another project ends it.
- Without storage (some private windows), the link sets up the project the
  tab works on.

The entry point is `src/state/actions/deeplink.ts`; the new project is
created by `initProjects({ start })` in `src/services/projects.ts`. Tests:
`tests/services/deep-link-start.test.ts`, `tests/state/deep-link-photo-size.test.ts`
and `e2e/specs/deep-links.spec.ts`.
