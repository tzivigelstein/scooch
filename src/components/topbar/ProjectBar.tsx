// The open project in the top bar: its name (renamed in place), the save
// status and the «Proyectos» button.

import { Check, CircleAlert, FolderOpen, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../../copy/index.ts';
import { rename, retry } from '../../services/projects.ts';
import { useProject } from '../../state/project.ts';
import { openProjects } from '../../state/actions/dialogs.ts';
import { openFailed, takeOverWithUi } from '../../state/actions/projects.ts';
import { IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { announce } from '../feedback/announcer.ts';

type Kind = 'saved' | 'pending' | 'loading' | 'error' | 'off' | 'readonly';

const GLYPHS: Record<Kind, [name: string, icon: LucideIcon]> = {
  saved: ['check', Check],
  pending: ['loader-circle', LoaderCircle],
  loading: ['loader-circle', LoaderCircle],
  error: ['triangle-alert', TriangleAlert],
  off: ['circle-alert', CircleAlert],
  readonly: ['circle-alert', CircleAlert],
};

export function ProjectBar() {
  const { id, name, status, storage } = useProject();
  const [renaming, setRenaming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const kind: Kind = status === 'saving' ? 'pending' : status;
  const [glyph, icon] = GLYPHS[kind];
  const retryText = status === 'error' ? t('projects.retry') : status === 'readonly' && storage ? t('projects.takeOver') : '';

  const editing = useRef(false);

  useLayoutEffect(() => {
    if (!renaming || !input.current) return;
    input.current.focus();
    input.current.select();
  }, [renaming]);

  const start = () => {
    if (!id || editing.current || !input.current) return;
    input.current.value = name ?? '';
    editing.current = true;
    setRenaming(true);
  };

  const finish = async (save: boolean, refocus = true) => {
    if (!editing.current || !input.current) return;
    editing.current = false;
    const value = input.current.value;
    flushSync(() => setRenaming(false));
    if (refocus) button.current?.focus();
    if (!save || !id || value.trim() === name) return;
    try {
      const renamed = await rename(id, value);
      announce(t('announce.projectRenamed', { name: renamed }));
    } catch (err) {
      console.error(err);
      openFailed(null, err);
    }
  };

  return (
    <div className="project-group">
      <div id="project" className="project" hidden={!id}>
        <button
          ref={button}
          type="button"
          id="project-name"
          className="project-name"
          aria-describedby="project-status-text"
          aria-label={name !== null ? t('projects.nameLabel', { name }) : undefined}
          data-tip={name ?? undefined}
          data-tip-note={t('projects.renameTip')}
          hidden={renaming}
          onClick={start}
        >
          <span id="project-name-text" className="project-name-text">
            {name}
          </span>
        </button>
        <input
          ref={input}
          type="text"
          id="project-name-input"
          className="project-name-input"
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('projects.nameField')}
          hidden={!renaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void finish(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              void finish(false);
            }
          }}
          onBlur={() => void finish(true, false)}
        />
        <span id="project-status" className="project-status" data-status={kind} data-tip={t(`projects.statusTip.${kind}`)}>
          <span id="project-status-icon" className="project-status-icon" aria-hidden="true" data-icon={glyph}>
            <Icon icon={icon} className="project-status-glyph" />
          </span>
          <span id="project-status-text" className="project-status-text">
            {t(`projects.status.${kind}`)}
          </span>
        </span>
        <button type="button" id="project-retry" className="text-btn project-retry" hidden={!retryText} onClick={() => void (status === 'readonly' ? takeOverWithUi() : retry())}>
          {retryText}
        </button>
      </div>
      <IconButton
        id="projects-open"
        className="tool"
        aria-haspopup="dialog"
        icon={FolderOpen}
        label={t('projects.title')}
        tip={t('projects.title')}
        shortcut="projects"
        disabled={status === 'loading'}
        onClick={() => void openProjects()}
      />
    </div>
  );
}
