// Almacenamiento de proyectos en IndexedDB, con la interfaz de projectstore.js.
// Base «pliego»: «projects» (registros, por id) y «files» (binarios como Blob,
// por [proyecto, clave], con un índice por proyecto). Nada sale del navegador.

const DB_NAME = 'pliego';
const DB_VERSION = 1;

const promised = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // Si la transacción se aborta (p. ej. por cuota), el error está en tx.error.
    tx.onabort = () => reject(tx.error ?? new DOMException('Transacción abortada', 'AbortError'));
    tx.onerror = () => {}; // se informa en onabort
  });

/**
 * Abre la base. Rechaza si IndexedDB no está o no se puede usar (algunos
 * navegadores en modo privado), o si no responde en `timeout` ms.
 */
export function openIdbStorage({ timeout = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      if (!globalThis.indexedDB) throw new Error('IndexedDB no está disponible');
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB no respondió')), timeout);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) {
        const files = db.createObjectStore('files', { keyPath: ['project', 'key'] });
        files.createIndex('project', 'project');
      }
    };
    request.onblocked = () => {}; // otra pestaña con una versión vieja: se espera
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // Si otra pestaña necesita actualizar la base, esta la suelta.
      db.onversionchange = () => db.close();
      resolve(idbStorage(db));
    };
  });
}

function idbStorage(db) {
  return {
    async list() {
      const tx = db.transaction('projects');
      return promised(tx.objectStore('projects').getAll());
    },
    async get(id) {
      const tx = db.transaction('projects');
      return (await promised(tx.objectStore('projects').get(id))) ?? null;
    },
    async files(id) {
      const tx = db.transaction('files');
      const rows = await promised(tx.objectStore('files').index('project').getAll(IDBKeyRange.only(id)));
      return new Map(rows.map((row) => [row.key, row.blob]));
    },
    async write(record, { put = new Map(), remove = [] } = {}) {
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      const finished = done(tx);
      const files = tx.objectStore('files');
      for (const [key, blob] of put) files.put({ project: record.id, key, blob });
      for (const key of remove) files.delete([record.id, key]);
      tx.objectStore('projects').put(record);
      return finished;
    },
    async remove(id) {
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      const finished = done(tx);
      tx.objectStore('projects').delete(id);
      tx.objectStore('files').index('project').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        tx.objectStore('files').delete(cursor.primaryKey);
        cursor.continue();
      };
      return finished;
    },
  };
}
