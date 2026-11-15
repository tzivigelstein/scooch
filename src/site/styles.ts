// The content pages' stylesheet, inlined in each page (one request per page,
// nothing to wait for). Plain CSS that follows the system's color scheme;
// the colors are the app's (src/styles/tokens.css). System fonts: no font
// file to download, so no swap and no layout shift. A table too wide for its
// box scrolls inside it, with a shadow on each side that has more to see
// (covers that move with the content hide the shadow at its ends).

/**
 * Only on pages with a table too wide for a phone (html.ts tableHtml, which
 * marks it .table-stack): narrower than a tablet, it shows one block per row,
 * the first cell as its title, then each value after its column's name. The
 * header row stays for screen readers only, and they don't read the names
 * drawn from data-label (the «/ ""»).
 */
export const STACKED_CSS = `
@media (max-width: 47.99rem) {
  .table-stack :is(tbody, tr, th, td) { display: block; padding: 0.125rem 0; border: 0; text-align: left; white-space: normal; }
  .table-stack table { display: flex; flex-direction: column; }
  .table-stack caption { order: 1; }
  .table-stack thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .table-stack tr { padding: 0.625rem 0; border-bottom: 1px solid var(--line); }
  .table-stack tr > :first-child { padding-bottom: 0.25rem; font-weight: 600; }
  .table-stack td[data-label] { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 1rem; }
  .table-stack td.num { grid-template-columns: minmax(0, 1fr) auto; text-align: right; }
  .table-stack td[data-label]::before { content: attr(data-label); content: attr(data-label) / ""; color: var(--muted); text-align: left; }
}
`;

export const SITE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f4f5f7;
  --text: #0e1014;
  --muted: #5a6170;
  --line: #e1e4e8;
  --line-strong: #858b97;
  --brand: #0066ff;
  --link: #0052cc;
  --btn-bg: #0066ff;
  --btn-hover: #0052cc;
  --btn-ink: #ffffff;
  --soft: #e8f0ff;
  --focus: #0066ff;
  --note-bg: #fff3df;
  --note-text: #6b3800;
  --note-line: #c98a1e;
  --scroll-shadow: rgba(14, 16, 20, 0.3);
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171c;
    --surface: #1c1f25;
    --text: #eef0f3;
    --muted: #a3aab7;
    --line: #2c3038;
    --line-strong: #737a88;
    --brand: #5c9dff;
    --link: #8ab8ff;
    --btn-bg: #5c9dff;
    --btn-hover: #80b3ff;
    --btn-ink: #04132b;
    --soft: #172a4b;
    --focus: #6ea8ff;
    --note-bg: #36260d;
    --note-text: #ffd699;
    --note-line: #a8711a;
    --scroll-shadow: rgba(238, 240, 243, 0.25);
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 1.0625rem/1.6 var(--font); overflow-wrap: break-word; }
a { color: var(--link); text-underline-offset: 0.15em; }
a:hover { text-decoration-thickness: 0.125em; }
:focus-visible { outline: 0.125rem solid var(--focus); outline-offset: 0.125rem; }
[hidden] { display: none !important; }
.skip { position: absolute; left: 0.75rem; top: -4rem; padding: 0.5rem 0.875rem; border-radius: 0.5rem; background: var(--btn-bg); color: var(--btn-ink); font-weight: 600; z-index: 1; }
.skip:focus { top: 0.75rem; }
.wrap { width: 100%; max-width: 46rem; margin-inline: auto; padding-inline: 1rem; }
.site-header { border-bottom: 1px solid var(--line); }
.site-header .wrap { max-width: 64rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3.75rem; }
.brand { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text); font-size: 1.1875rem; font-weight: 800; letter-spacing: -0.03em; text-decoration: none; }
.brand svg { color: var(--brand); flex: none; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0.5rem 1.125rem; border: 1px solid transparent; border-radius: 0.625rem; font-weight: 600; line-height: 1.25; text-align: center; text-decoration: none; }
.btn-primary { background: var(--btn-bg); color: var(--btn-ink); }
.btn-primary:hover { background: var(--btn-hover); }
.btn-secondary { border-color: var(--line-strong); color: var(--text); }
.btn-secondary:hover { background: var(--surface); }
.btn-small { min-height: 2.5rem; padding: 0.375rem 0.875rem; font-size: 0.9375rem; }
main { padding-block: 1.25rem 3rem; }
.crumbs ol { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; margin: 0 0 1.25rem; padding: 0; list-style: none; color: var(--muted); font-size: 0.875rem; }
.crumbs li + li::before { content: "›"; margin-right: 0.5rem; }
.crumbs a { color: var(--muted); }
h1 { margin: 0 0 1rem; font-size: clamp(1.75rem, 1.15rem + 2.4vw, 2.5rem); line-height: 1.15; letter-spacing: -0.02em; }
h2 { margin: 2.5rem 0 0.75rem; font-size: 1.375rem; line-height: 1.3; letter-spacing: -0.01em; }
h3 { margin: 1.5rem 0 0.375rem; font-size: 1.0625rem; line-height: 1.4; }
h4 { margin: 1.25rem 0 0.375rem; font-size: 1rem; }
p, ul, ol { margin: 0 0 1rem; }
li { margin-bottom: 0.375rem; }
.lead { font-size: 1.1875rem; }
.muted { color: var(--muted); }
.ctas { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1.5rem 0 2rem; }
.steps { margin: 0 0 1.25rem; padding: 0; list-style: none; counter-reset: step; }
.steps li { position: relative; margin-bottom: 0.875rem; padding-left: 2.5rem; }
.steps li::before { content: counter(step); counter-increment: step; position: absolute; left: 0; top: 0.0625rem; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: var(--soft); color: var(--link); font-size: 0.9375rem; font-weight: 700; }
.note { padding: 0.75rem 1rem; border-left: 0.25rem solid var(--note-line); border-radius: 0.375rem; background: var(--note-bg); color: var(--note-text); }
.note a { color: inherit; }
.sheet-figure { margin: 1.5rem 0; }
.sheet-svg { display: block; width: 100%; height: auto; max-height: 22rem; }
.sheet-svg .sheet { fill: #ffffff; stroke: #b9c0ca; }
.sheet-svg .margin { fill: none; stroke: #8a93a0; }
.sheet-svg .photo { fill: #d6e4ff; stroke: #0052cc; }
figcaption { margin-top: 0.5rem; color: var(--muted); font-size: 0.9375rem; text-align: center; }
.table-wrap {
  margin: 0 0 1.5rem;
  overflow-x: auto;
  background:
    linear-gradient(to right, var(--bg) 30%, transparent) left / 2.5rem 100% no-repeat local,
    linear-gradient(to left, var(--bg) 30%, transparent) right / 2.5rem 100% no-repeat local,
    radial-gradient(farthest-side at 0 50%, var(--scroll-shadow), transparent) left / 0.875rem 100% no-repeat scroll,
    radial-gradient(farthest-side at 100% 50%, var(--scroll-shadow), transparent) right / 0.875rem 100% no-repeat scroll;
}
table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
caption { padding-top: 0.5rem; caption-side: bottom; color: var(--muted); font-size: 0.875rem; text-align: left; }
th, td { padding: 0.5rem 0.625rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
/* A long name or address breaks instead of pushing its column out; a heading never does, so no column gets narrower than its heading. */
td { overflow-wrap: anywhere; }
thead th { border-bottom-color: var(--line-strong); font-weight: 600; }
tbody th { font-weight: 500; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
td.num { white-space: nowrap; }
code { padding: 0.1em 0.3em; border-radius: 0.25rem; background: var(--surface); font-family: var(--mono); font-size: 0.875em; }
pre { margin: 0 0 1.25rem; padding: 1rem; overflow-x: auto; border-radius: 0.5rem; background: var(--surface); font-size: 0.8125rem; line-height: 1.5; }
pre code { padding: 0; background: none; font-size: inherit; }
blockquote { margin: 0 0 1rem; padding: 0.25rem 1rem; border-left: 0.25rem solid var(--line-strong); color: var(--muted); }
.doc-lang { margin-top: 2rem; }
.faq h3 { margin-top: 1.5rem; }
.calc { display: grid; gap: 1.25rem; margin: 1.5rem 0 2rem; padding: 1.25rem; border: 1px solid var(--line); border-radius: 0.875rem; background: var(--surface); }
.calc-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.875rem 1rem; }
.field { display: grid; align-content: start; gap: 0.25rem; }
.field-wide { grid-column: 1 / -1; }
.field label { font-size: 0.9375rem; font-weight: 600; }
.field select, .field input { width: 100%; min-height: 2.75rem; padding: 0.375rem 0.625rem; border: 1px solid var(--line-strong); border-radius: 0.5rem; background: var(--bg); color: var(--text); font: inherit; font-size: 1rem; }
.check { display: flex; align-items: center; gap: 0.625rem; grid-column: 1 / -1; min-height: 2.75rem; font-weight: 600; font-size: 0.9375rem; }
.check input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--btn-bg); }
.calc-result { display: grid; gap: 0.75rem; }
.calc-count { margin: 0; font-size: 1.125rem; }
.calc-count strong { display: block; font-size: 3rem; line-height: 1; letter-spacing: -0.03em; }
.calc-summary, .calc-note { margin: 0; }
.calc-summary { color: var(--muted); font-size: 0.9375rem; }
.calc-result .sheet-svg { max-height: 20rem; }
.calc-result .btn { justify-self: start; }
.site-footer { padding-block: 2rem 3rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.9375rem; }
.site-footer h2 { margin: 0 0 0.5rem; color: var(--text); font-size: 1rem; }
.site-footer ul { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin: 0 0 1.5rem; padding: 0; list-style: none; }
.site-footer li { margin: 0; }
@media (max-width: 34rem) {
  body { font-size: 1rem; }
  .calc { padding: 1rem; }
  .calc-form { grid-template-columns: 1fr; }
  .ctas .btn { width: 100%; }
  th, td { padding-inline: 0.375rem; }
}
`;
