// Armazenamento local (IndexedDB): contas locais e a "Minha Pasta" de projetos.
const DB_NAME = 'wdq-sampler';
const DB_VERSION = 1;
let dbp = null;
const memory = { projects: new Map(), users: new Map(), meta: new Map() };
let useMemory = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { useMemory = true; resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      const ps = db.createObjectStore('projects', { keyPath: 'key' });
      ps.createIndex('userId', 'userId');
      db.createObjectStore('users', { keyPath: 'email' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMemory = true; resolve(null); };
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  if (!db || useMemory) return fn(null, memory[store]);
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação abortada'));
  });
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const storageIsPersistent = async () => { await open(); return !useMemory; };

export async function putUser(u) {
  return tx('users', 'readwrite', (s, m) => (m ? m.set(u.email, u) : req2p(s.put(u))));
}
export async function getUser(email) {
  return tx('users', 'readonly', (s, m) => (m ? m.get(email) : req2p(s.get(email))));
}

export async function saveProject(userId, project) {
  const rec = { key: userId + ':' + project.id, userId, id: project.id, name: project.name, updated: project.updated, bpm: project.bpm, data: project };
  return tx('projects', 'readwrite', (s, m) => (m ? m.set(rec.key, structuredClone(rec)) : req2p(s.put(rec))));
}

export async function listProjects(userId) {
  const all = await tx('projects', 'readonly', (s, m) => {
    if (m) return [...m.values()].filter((r) => r.userId === userId);
    // lê só os metadados para a lista ficar rápida mesmo com muitos samples
    return new Promise((resolve, reject) => {
      const out = [];
      const r = s.index('userId').openCursor(IDBKeyRange.only(userId));
      r.onsuccess = () => {
        const c = r.result;
        if (!c) { resolve(out); return; }
        const v = c.value;
        out.push({ id: v.id, name: v.name, updated: v.updated, bpm: v.bpm });
        c.continue();
      };
      r.onerror = () => reject(r.error);
    });
  });
  return all.map((r) => ({ id: r.id, name: r.name, updated: r.updated, bpm: r.bpm })).sort((a, b) => b.updated - a.updated);
}

export async function loadProject(userId, id) {
  const rec = await tx('projects', 'readonly', (s, m) => (m ? m.get(userId + ':' + id) : req2p(s.get(userId + ':' + id))));
  return rec ? (useMemory ? structuredClone(rec.data) : rec.data) : null;
}

export async function deleteProject(userId, id) {
  return tx('projects', 'readwrite', (s, m) => (m ? m.delete(userId + ':' + id) : req2p(s.delete(userId + ':' + id))));
}

export async function setMeta(k, v) {
  return tx('meta', 'readwrite', (s, m) => (m ? m.set(k, { k, v }) : req2p(s.put({ k, v }))));
}
export async function getMeta(k) {
  const r = await tx('meta', 'readonly', (s, m) => (m ? m.get(k) : req2p(s.get(k))));
  return r ? r.v : undefined;
}
