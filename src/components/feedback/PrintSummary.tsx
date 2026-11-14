// The summary after printing or downloading (see printSummary.ts): the dialog
// that ends the job. Where the PDF went (when not to the print dialog), a ring
// with how much of the sheets is used, the sheets against one per piece (with
// that baseline in small print), one practical equivalent that takes turns,
// the running total on this device (with a line and a brief glow at its
// milestones) and, at most, a fuller arrangement when it surely saves a sheet.
// The request for a donation, when it applies, is a panel of its own.
// «Listo» starts focused.

import { Heart, Layers, LayoutDashboard, Leaf, Trophy } from 'lucide-react';
import { splitLink, t } from '../../copy/index.ts';
import { arrangeAll } from '../../state/actions/edit.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { donateUrl, neverAskDonation } from '../dialogs/donate.ts';
import { closeSummary, usePrintSummary, type PrintSummary as Summary } from './printSummary.ts';

const focusDone = () => document.getElementById('summary-done');

/** The equivalent's sentence: «Son unos 25 g de papel menos»… */
function equivalentText({ kind, value }: NonNullable<Summary['equivalent']>) {
  if (kind === 'grams') return t('summary.grams', { n: value >= 10 ? Math.round(value) : value });
  if (kind === 'ream') return t('summary.ream', { n: value * 100 });
  return t('summary.stack', { n: value });
}

/** Decorative: the usage line says the same. */
function Ring({ share, milestone }: { share: number; milestone: number | null }) {
  const percent = Math.round(share * 100);
  // pathLength 100: the dash is the percent.
  return (
    <div className="summary-ring" data-milestone={milestone ?? undefined} aria-hidden="true">
      <svg viewBox="0 0 120 120" focusable="false">
        <circle className="ring-track" cx="60" cy="60" r="54" />
        <circle className="ring-value" cx="60" cy="60" r="54" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - percent} />
      </svg>
      <span className="ring-label">{t('summary.percent', { n: percent })}</span>
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
  const { note, share, used, baseline, saved, equivalent, total, milestone, suggest, ask } = summary;
  const percent = t('summary.percent', { n: Math.round(share * 100) });
  const [before, link, after] = splitLink('summary.suggest');
  const url = donateUrl();
  const more = !!equivalent || total > 0 || !!milestone || suggest;
  return (
    <>
      <div className="dialog-head">
        <h2 id="summary-title" className="dialog-title">
          {t('summary.title')}
        </h2>
      </div>
      <div className="dialog-body summary-body">
        {note && (
          <p id="summary-note" className="summary-where">
            {note}
          </p>
        )}
        <div className="summary-main">
          <Ring share={share} milestone={milestone} />
          <div id="summary-lines" className="summary-lines">
            <p className="summary-usage">{t('summary.usage', { n: used, pct: percent })}</p>
            {saved > 0 && <p className="summary-sheets">{t('summary.sheets', { n: used, baseline })}</p>}
            {saved > 0 && <p className="summary-note">{t('summary.baseline')}</p>}
          </div>
        </div>
        {more && (
          <div className="summary-more">
            {equivalent && (
              <p id="summary-equivalent">
                <Icon icon={Leaf} />
                <span>{equivalentText(equivalent)}</span>
              </p>
            )}
            {milestone ? (
              <p id="summary-total" className="summary-milestone">
                <Icon icon={Trophy} />
                <span>{t('summary.milestone', { n: milestone })}</span>
              </p>
            ) : (
              total > 0 && (
                <p id="summary-total">
                  <Icon icon={Layers} />
                  <span>{t('summary.total', { n: total })}</span>
                </p>
              )
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
  return (
    <Dialog
      id="print-summary"
      className="dialog print-summary"
      labelledBy="summary-title"
      describedBy={summary ? (summary.note ? 'summary-note summary-lines' : 'summary-lines') : undefined}
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
