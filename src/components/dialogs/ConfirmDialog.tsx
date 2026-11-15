// The confirmation dialog (see confirm.ts).

import { useRef } from 'react';
import { t } from '../../copy/index.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { useConfirm } from './confirm.ts';
import './ConfirmDialog.css';

export function ConfirmDialog() {
  const request = useConfirm((s) => s.request);
  const result = useRef(false);
  const close = () => {
    const current = useConfirm.getState().request;
    if (!current) return;
    useConfirm.setState({ request: null });
    current.resolve(result.current);
    result.current = false;
  };
  return (
    <Dialog
      id="confirm"
      className="dialog confirm"
      labelledBy="confirm-title"
      describedBy="confirm-body"
      open={!!request}
      returnTo={request?.returnTo ?? null}
      initialFocus={() => document.getElementById(request?.focus === 'cancel' ? 'confirm-cancel' : 'confirm-ok')}
      onClose={close}
    >
      <div className="dialog-head">
        <h2 id="confirm-title" className="dialog-title">
          {request?.title}
        </h2>
      </div>
      <div className="dialog-body">
        <p id="confirm-body" className="confirm-body">
          {request?.body}
        </p>
      </div>
      <div className="dialog-actions">
        <button type="button" id="confirm-cancel" className="btn ghost" onClick={close}>
          {t('confirm.cancel')}
        </button>
        <button
          type="button"
          id="confirm-ok"
          className="btn danger"
          onClick={() => {
            result.current = true;
            close();
          }}
        >
          {request?.confirm}
        </button>
      </div>
    </Dialog>
  );
}
