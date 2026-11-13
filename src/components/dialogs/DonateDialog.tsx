// The donation dialog (see donate.ts): every way of closing it continues the
// export, in the same user gesture.

import { DropletOff, Heart, MegaphoneOff, ShieldCheck, X } from 'lucide-react';
import { t } from '../../copy/index.ts';
import { Icon } from '../ui/Icon.tsx';
import { donateUrl, finishDonation } from './donate.ts';

export default function DonateDialog() {
  return (
    <>
      <div className="donate-hero" aria-hidden="true">
        <svg className="donate-art" viewBox="0 0 240 132" width="240" height="132" focusable="false">
          <g transform="rotate(-7 120 80)">
            <rect x="70" y="18" width="104" height="134" rx="7" fill="#fff" />
            <rect x="81" y="29" width="40" height="50" rx="3.5" fill="#8fb4ff" />
            <rect x="125" y="29" width="38" height="30" rx="3.5" fill="#ffb59c" />
            <rect x="125" y="63" width="38" height="44" rx="3.5" fill="#c9bcff" />
            <rect x="81" y="83" width="40" height="24" rx="3.5" fill="#ffd77f" />
            <rect x="81" y="111" width="82" height="22" rx="3.5" fill="#9fe0c4" />
          </g>
        </svg>
        <span className="donate-heart">
          <Icon icon={Heart} />
        </span>
      </div>
      <button type="button" id="donate-close" className="icon-btn donate-close" aria-label={t('donate.close')} data-tip={t('donate.close')} onClick={() => finishDonation('close')}>
        <Icon icon={X} />
      </button>
      <div className="donate-content">
        <h2 id="donate-title" className="donate-title" tabIndex={-1}>
          {t('donate.title')}
        </h2>
        <div id="donate-body" className="donate-body">
          <p>{t('donate.body1')}</p>
          <p>{t('donate.body2')}</p>
        </div>
        <ul id="donate-benefits" className="donate-benefits">
          <li>
            <Icon icon={MegaphoneOff} />
            <span>{t('donate.benefits.noAds')}</span>
          </li>
          <li>
            <Icon icon={DropletOff} />
            <span>{t('donate.benefits.noWatermark')}</span>
          </li>
          <li>
            <Icon icon={ShieldCheck} />
            <span>{t('donate.benefits.private')}</span>
          </li>
        </ul>
        <a id="donate-cta" className="donate-cta" href={donateUrl() || '#'} target="_blank" rel="noopener noreferrer" onClick={() => finishDonation('cta')}>
          <Icon icon={Heart} />
          <span id="donate-cta-text">{t('donate.cta')}</span>
        </a>
        <p id="donate-note" className="donate-note">
          {t('donate.ctaNote')}
        </p>
        <button type="button" id="donate-skip" className="donate-skip" onClick={() => finishDonation('skip')}>
          {t('donate.skip')}
        </button>
        <label className="donate-never">
          <input type="checkbox" id="donate-never" />
          <span id="donate-never-text">{t('donate.never')}</span>
        </label>
        <p id="donate-thanks" className="donate-thanks">
          {t('donate.thanks')}
        </p>
      </div>
    </>
  );
}
