// The clock budgets of performance.spec.ts, scaled by E2E_TIME_FACTOR: 1
// unless set, so on a developer's machine the budgets apply as written. CI
// sets it (.github/workflows/ci.yml): a shared runner is slower and noisier
// than the machines the budgets were set on. See docs/testing.md.
const raw = process.env.E2E_TIME_FACTOR;

/** How many times a clock budget is allowed. */
export const TIME_FACTOR = raw ? Number(raw) : 1;
if (!(TIME_FACTOR > 0 && Number.isFinite(TIME_FACTOR))) throw new Error(`E2E_TIME_FACTOR must be a positive number, not «${raw}»`);

/** A clock budget (ms), scaled by E2E_TIME_FACTOR. */
export const budget = (ms: number) => ms * TIME_FACTOR;
