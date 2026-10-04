// Walks folders for PDFs and extracts them through a worker pool, with an
// on-disk cache keyed by path + size + mtime so re-scans are near-instant.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_FILE = path.join(ROOT, '.cache', 'pdf-index.json');
const WORKER_FILE = path.join(ROOT, 'lib', 'worker.js');
const SKIP_DIRS = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information']);
const CACHE_VERSION = 1;

let cache = null;
let cacheDirty = false;

async function loadCache() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    cache = raw.version === CACHE_VERSION ? new Map(Object.entries(raw.entries)) : new Map();
  } catch {
    cache = new Map();
  }
  return cache;
}

export async function saveCache() {
  if (!cache || !cacheDirty) return;
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  const tmp = CACHE_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ version: CACHE_VERSION, entries: Object.fromEntries(cache) }));
  await fs.rename(tmp, CACHE_FILE);
  cacheDirty = false;
}

export async function clearCache() {
  cache = new Map();
  cacheDirty = false;
  await fs.rm(CACHE_FILE, { force: true });
}

export async function findPdfs(dir, onProgress) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue; // unreadable folder
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
        out.push(full);
        if (out.length % 200 === 0) onProgress?.(out.length);
      }
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.seq = 0;
    for (let i = 0; i < size; i++) this.#spawn();
  }

  #spawn() {
    const w = new Worker(WORKER_FILE);
    w.on('message', ({ id, data, error }) => {
      const p = this.pending.get(id);
      this.pending.delete(id);
      w.busyId = null;
      this.idle.push(w);
      this.#drain();
      if (p) error ? p.reject(new Error(error)) : p.resolve(data);
    });
    w.on('error', (err) => {
      // A crashed worker fails its current job and is replaced.
      const p = this.pending.get(w.busyId);
      this.pending.delete(w.busyId);
      this.workers = this.workers.filter((x) => x !== w);
      this.idle = this.idle.filter((x) => x !== w);
      p?.reject(err);
      if (!this.closed) {
        this.#spawn();
        this.#drain();
      }
    });
    this.workers.push(w);
    this.idle.push(w);
  }

  #drain() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop();
      const job = this.queue.shift();
      w.busyId = job.id;
      this.pending.set(job.id, job);
      w.postMessage({ id: job.id, file: job.file });
    }
  }

  run(file) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.seq, file, resolve, reject });
      this.#drain();
    });
  }

  async close() {
    this.closed = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/**
 * Extract every PDF in `files`. Calls onItem(record) as each finishes.
 * Returns an array of { path, name, folder, size, mtime, data?, error? }.
 */
export async function extractAll(files, { onItem, signal, rootDir } = {}) {
  await loadCache();
  const size = Math.max(1, Math.min(8, os.cpus().length - 1));
  const pool = new WorkerPool(size);
  const results = new Array(files.length);
  let next = 0;

  async function handle(i) {
    const file = files[i];
    const rec = {
      path: file,
      name: path.basename(file),
      folder: path.dirname(file),
      relFolder: rootDir ? path.relative(rootDir, path.dirname(file)) || '.' : path.dirname(file),
    };
    try {
      const st = await fs.stat(file);
      rec.size = st.size;
      rec.mtime = st.mtimeMs;
      const key = `${file}|${st.size}|${st.mtimeMs}`;
      const hit = cache.get(key);
      if (hit) {
        rec.data = hit;
        rec.cached = true;
      } else {
        rec.data = await pool.run(file);
        cache.set(key, rec.data);
        cacheDirty = true;
      }
    } catch (err) {
      rec.error = err.message;
    }
    results[i] = rec;
    onItem?.(rec);
  }

  try {
    const lanes = Array.from({ length: size * 2 }, async () => {
      while (next < files.length) {
        if (signal?.aborted) return;
        await handle(next++);
      }
    });
    await Promise.all(lanes);
  } finally {
    await pool.close();
    await saveCache().catch(() => {});
  }
  return results.filter(Boolean);
}
