// The content hash binaries are stored by (one copy per content, however many
// pieces, projects or undo steps use it). SHA-256 with WebCrypto, which runs
// off the main thread. Where the browser can't hash (WebCrypto only exists in
// secure contexts: https and localhost), a unique id: nothing is shared, and
// nothing breaks.

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

let unique = 0;
const uniqueId = () => `u${Date.now().toString(36)}${(++unique).toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** The hash of some bytes. */
export async function hashBytes(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return uniqueId();
  try {
    return hex(await subtle.digest('SHA-256', bytes as BufferSource));
  } catch {
    return uniqueId();
  }
}

/** The hash of a Blob's content. */
export const hashBlob = async (blob: Blob) => hashBytes(await blob.arrayBuffer());
