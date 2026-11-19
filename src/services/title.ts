// The tab's title. With pieces on its sheets, it is the open project's name
// and the app's («Tarjetas — Scooch»), so tabs with different projects tell
// apart; an empty project keeps the app's own title, the one search engines
// show too. The static pages have their own (src/site).

import { APP_NAME } from '../config.ts';
import { t } from '../copy/index.ts';
import { useDocument } from '../state/document.ts';
import { useProject } from '../state/project.ts';

/** The title for a project named `name` (null: none open yet) with `pieces` pieces. */
export const tabTitle = (name: string | null, pieces: number) => (name && pieces > 0 ? `${name} — ${APP_NAME}` : t('app.title'));

/** Gives the tab the title it should have now. */
export function showTitle() {
  const title = tabTitle(useProject.getState().name, useDocument.getState().items.length);
  if (document.title !== title) document.title = title;
}

/** Keeps the tab's title up to date with the open project's name and whether it has pieces. */
export function followTitle() {
  const stops = [
    useProject.subscribe((now, before) => {
      if (now.name !== before.name) showTitle();
    }),
    useDocument.subscribe((now, before) => {
      if (now.items.length > 0 !== before.items.length > 0) showTitle();
    }),
  ];
  return () => stops.forEach((stop) => stop());
}
