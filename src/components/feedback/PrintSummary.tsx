// The summary after printing or downloading (see printSummary.ts): the dialog
// that ends the job, told as a comparison. Its title says the sheets saved
// (or, with none, that the PDF is ready) over the share of paper saved as a
// big figure; then where the PDF went (when not to the print dialog); the
// sheets drawn one per piece against the ones used, the saved ones as ghosts
// (decorative: a hidden sentence says it); how much of the sheets is used,
// with a small meter; and the running total on this device with what it weighs or
// stacks up to, a badge at its milestones and, at most, a fuller arrangement
// when it surely saves a sheet. The request for a donation, when it applies,
// is a panel of its own. «Listo» starts focused.

import type { CSSProperties } from 'react';
import { Heart, Layers, LayoutDashboard, Leaf, Trophy } from 'lucide-react';
import type { Equivalent } from '../../core/savings.js';
import { splitLink, t } from '../../copy/index.ts';
import { arrangeAll } from '../../state/actions/edit.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { donateUrl, neverAskDonation } from '../dialogs/donate.ts';
import { closeSummary, usePrintSummary, type PrintSummary as Summary } from './printSummary.ts';
import './PrintSummary.css';

/** Sheets drawn in each row of the comparison; the rest is a «+N», so it never overflows. */
export const DRAWN = 12;

const focusDone = () => document.getElementById('summary-done');

const factText = ({ kind, value }: Equivalent) => t(`summary.facts.${kind}`, { n: value });

/** «60 % menos papel», with the figure bigger wherever the language puts it. */
function Figure({ saved, baseline }: { saved: number; baseline: number }) {
  // Rounded down: never more than it saves.
  const pct = t('summary.percent', { n: Math.floor((saved / baseline) * 100) });
  const text = t('summary.less', { pct });
  const at = text.indexOf(pct);
  return (
    <p id="summary-figure" className="summary-figure">
      {at < 0 ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <span className="figure-value">{pct}</span>
          {text.slice(at + pct.length)}
        </>
      )}
    </p>
  );
}

/** One way of printing: its name, its count and its sheets (`used` of them full, the rest saved). */
function SheetRow({ name, count, slots, used, className }: { name: string; count: number; slots: number; used: number; className: string }) {
  const drawn = Math.min(used, slots);
  return (
    <div className={`compare-row ${className}`}>
      <span className="compare-name">{name}</span>
      <span className="compare-count">{t('summary.count', { n: count })}</span>
      <span className="compare-sheets">
        {Array.from({ length: slots }, (_, i) => (
          <i key={i} className={i < drawn ? 'paper' : 'paper is-saved'} style={{ '--i': i } as CSSProperties} />
        ))}
        {used > drawn && <span className="compare-more">{t('summary.more', { n: used - drawn })}</span>}
      </span>
    </div>
  );
}

/** Decorative: the hidden sentence before it says the same. */
function Comparison({ used, baseline }: { used: number; baseline: number }) {
  const slots = Math.min(baseline, DRAWN);
  return (
    <div className="summary-compare" data-more={baseline > slots || undefined} style={{ '--slots': slots } as CSSProperties} aria-hidden="true">
      <SheetRow name={t('summary.oneEach')} count={baseline} slots={slots} used={baseline} className="is-baseline" />
      <SheetRow name={t('summary.withApp')} count={used} slots={slots} used={used} className="is-app" />
    </div>
  );
}

function DonationAsk({ url }: { url: string }) {
  return (
    <section className="summary-ask" aria-labelledby="summary-ask-title">
      <div className="ask-head">
        <span className="ask-heart" aria-hidden="true">
          <Icon icon={Heart} />
        </span>
        <h3 id="summary-ask-title" className="ask-title">
          {t('donate.title')}
        </h3>
      </div>
      <p className="ask-body">{t('donate.body')}</p>
      <div className="ask-actions">
        <a id="summary-donate" className="ask-cta" href={url} target="_blank" rel="noopener noreferrer" data-tip={t('donate.ctaNote')}>
          <Icon icon={Heart} />
          <span>{t('donate.cta')}</span>
        </a>
        <button
          type="button"
          id="summary-donate-never"
          className="text-btn ask-never"
          onClick={() => {
            neverAskDonation();
            const { summary } = usePrintSummary.getState();
            if (summary) usePrintSummary.setState({ summary: { ...summary, ask: false } });
            focusDone()?.focus();
          }}
        >
          {t('donate.never')}
        </button>
      </div>
    </section>
  );
}

function SummaryContent({ summary }: { summary: Summary }) {
  const { note, share, used, baseline, saved, equivalent, total, totalEquivalent, milestone, suggest, ask } = summary;
  const usage = Math.round(share * 100);
  const [before, link, after] = splitLink('summary.suggest');
  const url = donateUrl();
  // The equivalent goes with the total, where the numbers are bigger; this PDF's, only without one.
  const pdfEquivalent = total > 0 ? null : equivalent;
  const more = total > 0 || !!milestone || !!pdfEquivalent || suggest;
  return (
    <>
      <div className="dialog-head summary-head" data-saved={saved > 0 || undefined}>
        <h2 id="summary-title" className="dialog-title summary-title">
          {saved > 0 ? t('summary.saved', { n: saved }) : t('summary.ready')}
        </h2>
        {saved > 0 && <Figure saved={saved} baseline={baseline} />}
      </div>
      <div className="dialog-body summary-body">
        {note && (
          <p id="summary-note" className="summary-where">
            {note}
          </p>
        )}
        <div id="summary-lines" className="summary-lines">
          {saved > 0 && (
            <>
              <p className="sr-only">{t('summary.sheets', { n: used, baseline })}</p>
              <Comparison used={used} baseline={baseline} />
            </>
          )}
          <div className="summary-usage-row">
            <p className="summary-usage">{t('summary.usage', { n: used, pct: t('summary.percent', { n: usage }) })}</p>
            <span className="summary-meter" aria-hidden="true">
              <span style={{ width: `${usage}%` }} />
            </span>
          </div>
        </div>
        {more && (
          <div className="summary-more">
            {milestone && (
              <p id="summary-milestone" className="summary-milestone">
                <Icon icon={Trophy} />
                <span>{t('summary.milestone', { n: milestone })}</span>
              </p>
            )}
            {total > 0 && (
              <p id="summary-total">
                <Icon icon={Layers} />
                <span>{totalEquivalent ? t('summary.totalWith', { n: total, fact: factText(totalEquivalent) }) : t('summary.total', { n: total })}</span>
              </p>
            )}
            {pdfEquivalent && (
              <p id="summary-equivalent">
                <Icon icon={Leaf} />
                <span>{t('summary.equivalent', { fact: factText(pdfEquivalent) })}</span>
              </p>
            )}
            {suggest && (
              <p id="summary-suggest">
                <Icon icon={LayoutDashboard} />
                <span>
                  {before}
                  <button type="button" className="link-btn" onClick={() => (closeSummary(), arrangeAll())}>
                    {link}
                  </button>
                  {after}
                </span>
              </p>
            )}
          </div>
        )}
        {ask && url && <DonationAsk url={url} />}
      </div>
      <div className="dialog-actions summary-actions">
        <button type="button" id="summary-done" className="btn primary" onClick={closeSummary}>
          {t('summary.done')}
        </button>
      </div>
    </>
  );
}

export function PrintSummary() {
  const summary = usePrintSummary((s) => s.summary);
  const returnTo = usePrintSummary((s) => s.returnTo);
  const kind = usePrintSummary((s) => s.kind);
  const describedBy = summary && [summary.saved > 0 && 'summary-figure', summary.note && 'summary-note', 'summary-lines'].filter(Boolean).join(' ');
  return (
    <Dialog
      id="print-summary"
      className="dialog print-summary"
      labelledBy="summary-title"
      describedBy={describedBy || undefined}
      open={!!summary}
      returnTo={returnTo}
      // When nothing usable had the focus (Safari doesn't focus a clicked button): its button.
      fallback={() => document.getElementById(kind === 'print' ? 'print' : 'export')}
      initialFocus={focusDone}
      onClose={closeSummary}
    >
      {summary && <SummaryContent summary={summary} />}
    </Dialog>
  );
}
