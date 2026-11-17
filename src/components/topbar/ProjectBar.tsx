// The open project in the top bar: its name (renamed in place), what stops
// it from being saved, if anything (with what to do about it), and the
// «Proyectos» button. Saving itself shows nothing: it always happens. The
// save status is in data-status (tests and styles).

import { CircleAlert, FolderOpen, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../../copy/index.ts';
import { rename, retry } from '../../services/projects.ts';
import { useProject } from '../../state/project.ts';
import { openProjects } from '../../state/actions/dialogs.ts';
import { projectFailed, takeOverWithUi } from '../../state/actions/projects.ts';
import { IconButton } from '../ui/Button.tsx';
import { focusShown } from '../ui/focusShown.ts';
import { Icon } from '../ui/Icon.tsx';
import { announce } from '../feedback/announcer.ts';
import './ProjectBar.css';

/** The statuses that are a problem: the only ones shown. */
type Problem = 'error' | 'off' | 'readonly';

const PROBLEMS: Record<Problem, [name: string, icon: LucideIcon]> = {
  error: ['triangle-alert', TriangleAlert],
  off: ['circle-alert', CircleAlert],
  readonly: ['circle-alert', CircleAlert],
};

const isProblem = (status: string): status is Problem => status in PROBLEMS;

export function ProjectBar() {
  const { id, name, status, storage } = useProject();
  const [renaming, setRenaming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const problem = isProblem(status) ? status : null;
  const retryText = status === 'error' ? t('projects.retry') : status === 'readonly' && storage ? t('projects.takeOver') : '';

  const editing = useRef(false);

  useLayoutEffect(() => {
    if (!renaming || !input.current) return;
    // Shown again: without styling it first, WebKit could take the focus back
    // at the next frame, and the blur would close the field.
    focusShown(input.current);
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
      projectFailed('rename', name ?? '', err);
    }
  };

  return (
    <div className="project-group">
      <div id="project" className="project" hidden={!id} data-status={status}>
        <button
          ref={button}
          type="button"
          id="project-name"
          className="project-name"
          aria-describedby={problem ? 'project-status-text' : undefined}
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
        {problem && (
          <span id="project-status" className="project-status" data-status={problem} data-tip={t(`projects.statusTip.${problem}`)}>
            <span id="project-status-icon" className="project-status-icon" aria-hidden="true" data-icon={PROBLEMS[problem][0]}>
              <Icon icon={PROBLEMS[problem][1]} className="project-status-glyph" />
            </span>
            <span id="project-status-text" className="project-status-text">
              {t(`projects.status.${problem}`)}
            </span>
          </span>
        )}
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
