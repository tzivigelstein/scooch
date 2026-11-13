// What the interface shows of the open project (the session itself lives in services/projects.ts).

import { create } from 'zustand';

/**
 * 'loading', 'saved', 'pending', 'saving', 'error', 'off' (this browser can't
 * save) or 'readonly' (another tab saves it).
 */
export type SaveStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error' | 'off' | 'readonly';

export interface ProjectView {
  id: string | null;
  name: string | null;
  status: SaveStatus;
  /** Projects can be saved in this browser. */
  storage: boolean;
}

export const useProject = create<ProjectView>()(() => ({ id: null, name: null, status: 'loading', storage: false }));
