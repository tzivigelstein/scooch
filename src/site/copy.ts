// The site's pages are Spanish whatever language the editor shows: they use
// the editor's Spanish texts (src/copy/es.ts) directly.

import es from '../copy/es.ts';
import { textsFor } from '../copy/index.ts';

export const { t, formatNumber, formatList } = textsFor(es);
