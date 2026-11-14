// «Proyectos»: new project, open, duplicate, rename, delete and the space used.

import { CopyPlus, Pencil, Plus, Trash2, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatBytes, relativeTime, storageShare } from '../../core/humanize.js';
import { sizeOf } from '../../core/papers.js';
import type { ListedProject } from '../../core/types.ts';
import { numberLocale, t, type CopyKey } from '../../copy/index.ts';
import { duplicate, projectSession, rename } from '../../services/projects.ts';
import { flushUi } from '../../state/flush.ts';
import { useProject } from '../../state/project.ts';
import { refreshProjectList, useProjectList } from '../../state/actions/dialogs.ts';
import { createWithUi, openWithUi, projectFailed, removeWithUi } from '../../state/actions/projects.ts';
import { announce } from '../feedback/announcer.ts';
import { IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { confirmAction } from './confirm.ts';
import { closeDialog, isDialogOpen, useDialogs } from './dialogs.ts';

type Act = 'open' | 'duplicate' | 'rename' | 'delete';

const list = () => document.getElementById('project-list');

function focusCard(id: string | null, act: Act = 'open') {
  flushUi();
  const card = id ? list()?.querySelector(`.project-card[data-id="${CSS.escape(id)}"]`) : null;
  const target = card?.querySelector<HTMLElement>(`[data-act="${act}"]:not(:disabled)`) ?? card?.querySelector<HTMLElement>('button:not(:disabled)');
  (target ?? document.getElementById('project-new'))?.focus();
}

/** Reloads the list keeping the focus on the same card and action. */
async function refreshKeepingFocus() {
  const focused = document.activeElement?.closest<HTMLElement>('.project-card');
  const key = focused ? ([focused.dataset.id!, ((document.activeElement as HTMLElement).dataset.act ?? 'open') as Act] as const) : null;
  await refreshProjectList();
  if (key) focusCard(...key);
}

function Card({ record, current, thumb, renaming, onRename }: { record: ListedProject; current: boolean; thumb: string | null; renaming: boolean; onRename: (save: boolean, value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const metaId = `project-meta-${record.id}`;
  // Damaged, or saved by a newer version of the app: listed, but it can't be opened here.
  const closed = record.damaged || !!record.newer;
  const size = closed ? null : sizeOf(record.doc.paper, record.doc.landscape);

  useLayoutEffect(() => {
    if (!renaming || !input.current) return;
    input.current.value = record.name;
    input.current.focus();
    input.current.select();
  }, [renaming, record.name]);

  const tool = (act: Act, icon: LucideIcon, labelKey: CopyKey, tipKey: CopyKey, disabled = false) => (
    <IconButton
      className={`icon-btn small${act === 'delete' ? ' danger' : ''}`}
      data-act={act}
      icon={icon}
      label={t(labelKey, { name: record.name })}
      tip={t(tipKey)}
      disabled={disabled}
    />
  );

  const thumbnail = (
    <span className="project-thumb">
      {thumb ? <img alt="" src={thumb} /> : <span className="blank-page" style={{ aspectRatio: size ? `${size.w} / ${size.h}` : '210 / 297' }} />}
    </span>
  );

  return (
    <li className={`project-card${current ? ' is-current' : ''}${closed ? ' is-damaged' : ''}`} data-id={record.id}>
      {renaming ? (
        // Renaming edits the title in place: the card keeps its size and its thumbnail.
        <div className="project-open is-renaming">
          {thumbnail}
          <input
            ref={input}
            type="text"
            className="project-title-input"
            maxLength={80}
            aria-label={t('projects.nameField')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onRename(true, e.currentTarget.value);
              } else if (e.key === 'Escape') {
                // Esc cancels the rename, it doesn't close the dialog.
                e.preventDefault();
                e.stopPropagation();
                onRename(false, e.currentTarget.value);
              }
            }}
            onBlur={(e) => onRename(true, e.currentTarget.value)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="project-open"
          data-act="open"
          disabled={closed}
          aria-label={t(current ? 'projects.openCurrent' : 'projects.open', { name: record.name })}
          aria-describedby={metaId}
          data-tip={record.name}
        >
          {thumbnail}
          <span className="project-title">{record.name}</span>
        </button>
      )}
      <p className="project-meta" id={metaId}>
        {record.newer
          ? t('projects.newerMeta')
          : record.damaged
          ? t('projects.damagedMeta')
          : t('projects.meta', {
              when: relativeTime(record.modified, Date.now(), { locale: numberLocale }),
              sheets: t('projects.sheets', { n: record.counts?.sheets ?? 1 }),
              pieces: t('pieces.count', { n: record.counts?.pieces ?? 0 }),
            })}
      </p>
      <span className="project-badges">
        {current && (
          <span className="project-badge" data-kind="current">
            {t('projects.current')}
          </span>
        )}
        {closed && (
          <span className="project-badge" data-kind="damaged">
            {t(record.newer ? 'projects.newer' : 'projects.damaged')}
          </span>
        )}
      </span>
      <div className="project-actions">
        {tool('duplicate', CopyPlus, 'projects.duplicateLabel', 'projects.duplicate', closed)}
        {tool('rename', Pencil, 'projects.renameLabel', 'projects.rename', closed)}
        {tool('delete', Trash2, 'projects.deleteLabel', 'projects.delete')}
      </div>
    </li>
  );
}

/**
 * The space used, like a phone's storage settings: a thin bar and «2,3 MB de
 * 10,7 GB usados» with the percent (warning above 80 %). Nothing when the
 * browser doesn't say.
 */
function StorageUsage({ usage }: { usage: { usage: number; quota: number } | null }) {
  const share = usage && storageShare(usage.usage, usage.quota);
  if (!usage || !share) return null;
  const text = t('projects.usage', { used: formatBytes(usage.usage, { locale: numberLocale }), quota: formatBytes(usage.quota, { locale: numberLocale }) });
  const percent = share.percent === null ? t('projects.usageLess') : t('projects.usagePercent', { n: share.percent });
  return (
    <div id="storage-usage" className="storage-usage" data-level={share.warning ? 'warning' : undefined}>
      {share.warning && (
        <p id="storage-low" className="storage-low">
          <Icon icon={TriangleAlert} />
          <span>{t('projects.usageLow')}</span>
        </p>
      )}
      <div
        className="storage-meter"
        role="meter"
        aria-label={t('projects.usageName')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share.share * 100)}
        aria-valuetext={t('projects.usageValue', { usage: text, percent })}
      >
        <span className="storage-fill" style={{ width: `${share.fill * 100}%` }} />
      </div>
      <p className="storage-text">
        <span id="projects-usage">{text}</span>
        <span className="storage-percent">{percent}</span>
      </p>
    </div>
  );
}

export default function ProjectsDialog() {
  const listVersion = useDialogs((s) => s.listVersion);
  const { records, usage } = useProjectList();
  const currentId = useProject((s) => s.id);
  const available = useProject((s) => s.storage);
  const [renaming, setRenaming] = useState<string | null>(null);
  const editing = useRef<string | null>(null);
  const create = useRef<HTMLButtonElement>(null);
  const close = () => closeDialog('projects');

  // The thumbnails' URLs live as long as the list that shows them.
  const [thumbs, setThumbs] = useState(new Map<string, string>());
  useLayoutEffect(() => {
    const urls = new Map(records.filter((r) => r.thumb instanceof Blob).map((r) => [r.id, URL.createObjectURL(r.thumb!)]));
    setThumbs(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [records]);

  // Another tab changed something: the list reloads (not while renaming).
  const firstVersion = useRef(listVersion);
  useEffect(() => {
    if (listVersion !== firstVersion.current && !editing.current) void refreshKeepingFocus();
  }, [listVersion]);

  const finishRename = async (id: string, before: string, save: boolean, value: string) => {
    if (editing.current !== id) return;
    editing.current = null;
    setRenaming(null);
    if (save && value.trim() && value.trim() !== before) {
      try {
        const name = await rename(id, value);
        announce(t('announce.projectRenamed', { name }));
      } catch (err) {
        projectFailed('rename', before, err);
      }
    }
    await refreshProjectList();
    focusCard(id, 'rename');
  };

  const onClick = async (e: MouseEvent<HTMLUListElement>) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-act]');
    if (!button || button.disabled) return;
    const card = button.closest<HTMLElement>('.project-card')!;
    const id = card.dataset.id!;
    const record = records.find((r) => r.id === id);
    const name = record?.name ?? '';
    const act = button.dataset.act as Act;
    if (act === 'open') {
      if (id === projectSession().record?.id) return close();
      return openWithUi(id, name);
    }
    if (act === 'duplicate') {
      try {
        const copy = await duplicate(id);
        await refreshProjectList();
        focusCard(copy.id);
        announce(t('announce.projectDuplicated', { name }));
      } catch (err) {
        projectFailed('duplicate', name, err);
      }
      return;
    }
    if (act === 'rename') {
      if (editing.current) return;
      editing.current = id;
      setRenaming(id);
      return;
    }
    const ok = await confirmAction({
      title: t('projects.deleteTitle', { name }),
      body: t('projects.deleteBody'),
      confirm: t('projects.deleteConfirm'),
      focus: 'cancel',
      returnTo: button,
    });
    if (!ok) return;
    const cards = [...list()!.querySelectorAll<HTMLElement>('.project-card')];
    const next = cards[cards.indexOf(card) + 1] ?? cards[cards.indexOf(card) - 1];
    try {
      await removeWithUi(id, name);
    } catch (err) {
      projectFailed('delete', name, err);
    }
    if (!isDialogOpen('projects')) return;
    await refreshProjectList();
    if (next) focusCard(next.dataset.id!);
    else create.current?.focus();
  };

  // Up and down arrows (and Home and End) between the cards: to each one's
  // main button. Tab goes through their actions too.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if ((e.target as Element).tagName === 'INPUT') return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('.project-card')];
    const i = cards.indexOf((e.target as Element).closest<HTMLElement>('.project-card')!);
    if (i < 0) return;
    const next = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: cards.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined || next < 0 || next >= cards.length) return;
    e.preventDefault();
    cards[next].querySelector<HTMLElement>('button:not(:disabled):not([hidden])')?.focus();
  };

  return (
    <>
      <div className="dialog-head">
        <h2 id="projects-title" className="dialog-title">
          {t('projects.title')}
        </h2>
        <IconButton id="projects-close" icon={X} label={t('app.close')} tip={t('app.close')} onClick={close} />
      </div>
      <div className="dialog-body">
        <div className="projects-top">
          <button ref={create} type="button" id="project-new" className="btn primary" onClick={() => void createWithUi()}>
            <Icon icon={Plus} />
            <span>{t('projects.new')}</span>
          </button>
          <p className="projects-note">{t('projects.newNote')}</p>
        </div>
        <p id="projects-unavailable" className="callout" hidden={available}>
          <Icon icon={TriangleAlert} />
          <span>{t('projects.unavailable')}</span>
        </p>
        <ul id="project-list" className="project-list" aria-labelledby="projects-title" hidden={!records.length} onClick={(e) => void onClick(e)} onKeyDown={onKeyDown}>
          {records.map((record) => (
            <Card
              key={record.id}
              record={record}
              current={record.id === currentId}
              thumb={thumbs.get(record.id) ?? null}
              renaming={renaming === record.id}
              onRename={(save, value) => void finishRename(record.id, record.name, save, value)}
            />
          ))}
        </ul>
        <p id="projects-empty" className="projects-empty" hidden={!available || records.length > 0}>
          {t('projects.empty')}
        </p>
      </div>
      {usage && (
        <div className="dialog-foot">
          <StorageUsage usage={usage} />
        </div>
      )}
    </>
  );
}
