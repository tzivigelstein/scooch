// The summary after printing or downloading (see printSummary.ts): a small
// card, not a celebration. A ring with how much of the sheets is used, the
// sheets against one per piece (with that baseline said in small print), one
// practical equivalent that takes turns, the running total on this device
// (with a line and a brief glow at its milestones) and, at most, a fuller
// arrangement when it surely saves a sheet. The request for a donation, when
// it applies, is a link at its foot. Not modal: it sits after the top bar in
// the order of the page (Tab from «Imprimir» reaches it), and Esc closes it.

import { Heart, X } from 'lucide-react';
import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { splitLink, t } from '../../copy/index.ts';
import { arrangeAll } from '../../state/actions/edit.ts';
import { Icon } from '../ui/Icon.tsx';
import { IconButton } from '../ui/Button.tsx';
import { donateUrl, neverAskDonation } from '../dialogs/donate.ts';
import { closeSummary, usePrintSummary, type PrintSummary as Summary } from './printSummary.ts';

/** The equivalent's sentence: «Son unos 25 g de papel menos»… */
function equivalentText({ kind, value }: NonNullable<Summary['equivalent']>) {
  if (kind === 'grams') return t('summary.grams', { n: value >= 10 ? Math.round(value) : value });
  if (kind === 'ream') return t('summary.ream', { n: value * 100 });
  return t('summary.stack', { n: value });
}

function Ring({ share }: { share: number }) {
  const percent = Math.round(share * 100);
  // pathLength 100: the dash is the percent.
  return (
    <svg className="summary-ring" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle className="ring-track" cx="28" cy="28" r="24" />
      <circle className="ring-value" cx="28" cy="28" r="24" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - percent} />
      <text x="28" y="32.5" textAnchor="middle">
        {t('summary.percent', { n: percent })}
      </text>
    </svg>
  );
}

/** Back to «Imprimir» (or «Descargar PDF») when it closes from inside. */
function closeFromInside(kind: Summary['kind']) {
  const back = document.getElementById(kind === 'print' ? 'print' : 'export') as HTMLButtonElement | null;
  closeSummary();
  if (back && !back.disabled) back.focus();
}

/**
 * Tells the page how tall the card is (--summary-room): on narrow screens it
 * sits above «Piezas» and «Propiedades», and the toolbar and the notice go above it.
 */
function useRoom(card: RefObject<HTMLElement | null>, shown: boolean) {
  useLayoutEffect(() => {
    const el = card.current;
    const root = document.documentElement;
    if (!shown || !el) return;
    const measure = () => root.style.setProperty('--summary-room', `${el.offsetHeight + 8}px`);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--summary-room');
    };
  }, [card, shown]);
}

export function PrintSummary() {
  const summary = usePrintSummary((s) => s.summary);
  const card = useRef<HTMLElement>(null);
  useRoom(card, !!summary);
  if (!summary) return null;
  const { kind, note, share, used, baseline, saved, equivalent, total, milestone, suggest, ask } = summary;
  const percent = t('summary.percent', { n: Math.round(share * 100) });
  const [before, link, after] = splitLink('summary.suggest');
  const url = donateUrl();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeFromInside(kind);
  };
  return (
    <aside ref={card} id="print-summary" className="print-summary" aria-labelledby="summary-title" data-milestone={milestone ?? undefined} onKeyDown={onKeyDown}>
      <div className="summary-head">
        <h2 id="summary-title" className="summary-title">
          {t('summary.title')}
        </h2>
        <IconButton id="summary-close" className="icon-btn small" icon={X} label={t('summary.close')} tip={t('summary.close')} onClick={() => closeFromInside(kind)} />
      </div>
      {note && (
        <p id="summary-note" className="summary-where">
          {note}
        </p>
      )}
      <div className="summary-main">
        <Ring share={share} />
        <div className="summary-lines">
          <p className="summary-usage">{t('summary.usage', { n: used, pct: percent })}</p>
          {saved > 0 && <p>{t('summary.sheets', { n: used, baseline })}</p>}
          {saved > 0 && <p className="summary-note">{t('summary.baseline')}</p>}
        </div>
      </div>
      <div className="summary-more">
        {equivalent && <p id="summary-equivalent">{equivalentText(equivalent)}</p>}
        {milestone ? (
          <p id="summary-total" className="summary-milestone">
            {t('summary.milestone', { n: milestone })}
          </p>
        ) : (
          total > 0 && <p id="summary-total">{t('summary.total', { n: total })}</p>
        )}
        {suggest && (
          <p id="summary-suggest">
            {before}
            <button type="button" className="link-btn" onClick={() => (closeSummary(), arrangeAll())}>
              {link}
            </button>
            {after}
          </p>
        )}
      </div>
      {ask && url && (
        <div className="summary-ask">
          <a id="summary-donate" href={url} target="_blank" rel="noopener noreferrer" data-tip={t('donate.ctaNote')}>
            <Icon icon={Heart} />
            <span>{t('donate.cta')}</span>
          </a>
          <button
            type="button"
            id="summary-donate-never"
            className="text-btn"
            onClick={(e) => {
              neverAskDonation();
              usePrintSummary.setState({ summary: { ...summary, ask: false } });
              e.currentTarget.closest<HTMLElement>('.print-summary')?.querySelector<HTMLElement>('#summary-close')?.focus();
            }}
          >
            {t('donate.never')}
          </button>
        </div>
      )}
    </aside>
  );
}
