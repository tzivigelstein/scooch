// The advice before printing or downloading (see printTip.ts): a drawing of a
// print dialog whose scale goes from «Ajustar a la página» to «100 %» (still
// with reduced motion), the two choices with the document's own paper, and
// the button that prints or downloads.

import { t } from '../../copy/index.ts';
import { paperName } from '../../services/measure.ts';
import { finishTip, usePrintTip } from './printTip.ts';

/** A simplified print dialog, drawn: the preview, «Papel» and «Escala» (decorative: the steps say it). */
function PrintDialogDrawing({ paper }: { paper: string }) {
  return (
    <svg className="tip-drawing" viewBox="0 0 280 132" width="280" height="132" aria-hidden="true" focusable="false">
      <rect className="tip-window" x="1" y="1" width="278" height="130" rx="10" />
      <rect className="tip-sheet" x="16" y="14" width="74" height="104" rx="3" />
      <g className="tip-content">
        <rect x="24" y="22" width="26" height="34" rx="2" fill="#8fb4ff" />
        <rect x="54" y="22" width="28" height="20" rx="2" fill="#ffb59c" />
        <rect x="54" y="46" width="28" height="30" rx="2" fill="#c9bcff" />
        <rect x="24" y="60" width="26" height="16" rx="2" fill="#ffd77f" />
        <rect x="24" y="80" width="58" height="30" rx="2" fill="#9fe0c4" />
      </g>
      <text className="tip-label" x="108" y="28">
        {t('printTip.paper')}
      </text>
      <rect className="tip-select" x="108" y="34" width="156" height="26" rx="6" />
      <text className="tip-value" x="118" y="51.5">
        {paper}
      </text>
      <text className="tip-label" x="108" y="82">
        {t('printTip.scale')}
      </text>
      <rect className="tip-select tip-scale" x="108" y="88" width="156" height="26" rx="6" />
      <text className="tip-value tip-scale-from" x="118" y="105.5">
        {t('printTip.fit')}
      </text>
      <text className="tip-value tip-scale-to" x="118" y="105.5">
        {t('printTip.actual')}
      </text>
      <path className="tip-pointer" d="M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z" />
    </svg>
  );
}

export default function PrintTipDialog() {
  const kind = usePrintTip((s) => s.request?.kind ?? 'print');
  const paper = paperName();
  const download = kind === 'download';
  return (
    <>
      <div className="dialog-head">
        <h2 id="print-tip-title" className="dialog-title">
          {t(download ? 'printTip.titleDownload' : 'printTip.title')}
        </h2>
      </div>
      <div className="dialog-body print-tip-body">
        <PrintDialogDrawing paper={paper} />
        <p id="print-tip-lead" className="print-tip-lead">
          {t(download ? 'printTip.leadDownload' : 'printTip.lead')}
        </p>
        <ol id="print-tip-steps" className="print-tip-steps">
          <li>{t('printTip.scaleStep')}</li>
          <li>{t('printTip.paperStep', { paper })}</li>
        </ol>
        <label className="check print-tip-never">
          <input type="checkbox" id="print-tip-never" />
          <span>{t('printTip.never')}</span>
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" id="print-tip-cancel" className="btn ghost" onClick={() => finishTip(false)}>
          {t('printTip.cancel')}
        </button>
        <button type="button" id="print-tip-go" className="btn primary" onClick={() => finishTip(true)}>
          {t(download ? 'printTip.download' : 'printTip.print')}
        </button>
      </div>
    </>
  );
}
