// Small helpers to write HTML as strings (the site's pages are built as text,
// with no framework).

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text for an element or an attribute value. */
export const esc = (text: string | number) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** JSON for a <script type="application/ld+json"> or a data block: «<» escaped, so no text can close the script. */
export const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/** The text of some HTML: tags removed and the few entities this site writes decoded. */
export const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]!)
    // Line breaks and indentation of the source; no-break spaces stay.
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
