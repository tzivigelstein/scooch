// The content hash binaries are stored by (one copy per content, however many
// pieces, projects or undo steps use it). SHA-256 with WebCrypto, which runs
// off the main thread. Where the browser can't hash (WebCrypto only exists in
// secure contexts: https and localhost), a unique id: nothing is shared, and
// nothing breaks.
//
// And the bytes the app already holds for a Blob, so storing it (storage/idb.ts
// stores bytes) doesn't have to read it again: reading a Blob is asynchronous,
// and WebKit fails the read while the page is going away, which would lose a
// file added right before the tab closes. A Blob made from bytes the app keeps
// anyway is known as long as it lives; the bytes read to hash a Blob are kept
// until it is stored, at most READ_BUDGET of them (the oldest go first, and
// are read again if needed).

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

const READ_BUDGET = 64 * 1024 * 1024;
const made = new WeakMap<Blob, Uint8Array>();
const read = new Map<Blob, Uint8Array>();
let readSize = 0;

function keepRead(blob: Blob, bytes: Uint8Array) {
  forgetBytes(blob);
  read.set(blob, bytes);
  readSize += bytes.byteLength;
  for (const [oldest, kept] of read) {
    if (readSize <= READ_BUDGET || oldest === blob) break;
    read.delete(oldest);
    readSize -= kept.byteLength;
  }
}

/** The hash of a Blob's content (its bytes are kept until it is stored, see above). */
export async function hashBlob(blob: Blob): Promise<string> {
  const bytes = knownBytes(blob) ?? new Uint8Array(await blob.arrayBuffer());
  if (!made.has(blob)) keepRead(blob, bytes);
  return hashBytes(bytes);
}

/** A Blob of `bytes`, which the caller keeps anyway: its bytes are known without reading it. */
export function blobOfBytes(bytes: Uint8Array, type: string): Blob {
  const blob = new Blob([bytes as BlobPart], { type });
  made.set(blob, bytes);
  return blob;
}

/** The bytes the app holds for this Blob, if any. */
export const knownBytes = (blob: Blob): Uint8Array | undefined => made.get(blob) ?? read.get(blob);

/** The Blob is stored: the bytes read to hash it can go. */
export function forgetBytes(blob: Blob) {
  const kept = read.get(blob);
  if (!kept) return;
  read.delete(blob);
  readSize -= kept.byteLength;
}
