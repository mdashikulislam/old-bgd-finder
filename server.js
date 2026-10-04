import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findPdfs, extractAll, clearCache } from './lib/scanner.js';
import { matchRecords, RULES } from './lib/matcher.js';
import { searchRecord, parseQueries, SEARCH_FIELDS } from './lib/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const START_PORT = Number(process.env.PORT) || 4321;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Only files that were part of a scan may be served or revealed.
const knownFiles = new Set();
let scanRunning = false;

const IS_WIN = process.platform === 'win32';

/** Normalise a user-typed or pasted folder path for the current OS. */
function cleanPath(input) {
  let p = String(input || '').trim();
  p = p.replace(/^["']+|["']+$/g, '').trim(); // Windows "Copy as path" wraps in quotes
  if (/^file:\/\//i.test(p)) {
    try { p = fileURLToPath(p); } catch { /* keep as typed */ }
  }
  if (!IS_WIN) p = p.replace(/\\ /g, ' '); // dragged from a POSIX terminal: "My\ Folder"
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
  if (!p) return '';
  if (IS_WIN && /^[a-zA-Z]:$/.test(p)) p += '\\'; // "D:" alone means the drive root, not its cwd
  return path.resolve(p);
}

async function listDrives() {
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('');
  const found = await Promise.all(letters.map(async (l) => {
    const root = `${l}:\\`;
    const st = await fsp.stat(root).catch(() => null);
    return st?.isDirectory() ? root : null;
  }));
  return found.filter(Boolean).sort();
}

async function assertDir(p) {
  const st = await fsp.stat(p).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error(`Folder not found: ${p}`);
}

app.get('/api/info', (_req, res) => {
  res.json({
    platform: process.platform,
    home: os.homedir(),
    rules: Object.entries(RULES).map(([key, r]) => ({ key, ...r })),
    searchFields: Object.entries(SEARCH_FIELDS).map(([key, f]) => ({ key, label: f.label })),
  });
});

// ---------- folder picking ----------

function nativePicker(title) {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (process.platform === 'darwin') {
      cmd = 'osascript';
      args = ['-e', `POSIX path of (choose folder with prompt "${title.replace(/"/g, '')}")`];
    } else if (process.platform === 'win32') {
      cmd = 'powershell.exe';
      args = ['-NoProfile', '-STA', '-Command',
        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;` +
        `Add-Type -AssemblyName System.Windows.Forms;` +
        `$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${title.replace(/'/g, '')}';` +
        `$f = New-Object System.Windows.Forms.Form -Property @{TopMost=$true};` +
        `if ($d.ShowDialog($f) -eq 'OK') { $d.SelectedPath }`];
    } else {
      cmd = 'zenity';
      args = ['--file-selection', '--directory', `--title=${title}`];
    }
    const run = (cmd, args, onMissing) => execFile(cmd, args, { timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err?.code === 'ENOENT' && onMissing) return onMissing();
      const out = stdout.trim();
      if (out) return resolve(out.length > 1 ? out.replace(/[\/\\]$/, '') : out);
      // User cancelled (osascript -128 / zenity exit 1 / empty powershell output)
      if (!err || /-128|User canceled/i.test(stderr) || err.code === 1) return resolve(null);
      reject(err);
    });
    // Linux: zenity (GNOME) first, kdialog (KDE) as a fallback; otherwise the in-app browser is used.
    const kdialog = () => run('kdialog', ['--getexistingdirectory', os.homedir(), '--title', title]);
    run(cmd, args, cmd === 'zenity' ? kdialog : null);
  });
}

app.post('/api/pick-folder', async (req, res) => {
  try {
    const picked = await nativePicker(req.body?.title || 'Select a folder');
    res.json(picked ? { path: picked } : { cancelled: true });
  } catch {
    res.json({ unsupported: true });
  }
});

app.get('/api/browse', async (req, res) => {
  try {
    const raw = String(req.query.path ?? '');
    // Windows: an empty path after going "up" from a drive root lists the drives ("This PC").
    if (IS_WIN && raw === '' && req.query.drives === '1') {
      const drives = await listDrives();
      return res.json({ path: '', label: 'This PC', parent: null, dirs: drives.map((d) => ({ name: d, path: d })), pdfCount: 0 });
    }
    const dir = cleanPath(raw) || os.homedir();
    await assertDir(dir);
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ name, path: path.join(dir, name) }));
    const pdfCount = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf')).length;
    const parentDir = path.dirname(dir);
    const atRoot = parentDir === dir;
    // At a Windows drive root, "up" goes to the drive list (parent = '').
    const parent = atRoot ? (IS_WIN ? '' : null) : parentDir;
    res.json({ path: dir, label: dir, parent, dirs, pdfCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- compare (Server-Sent Events) ----------

app.get('/api/compare', async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const ac = new AbortController();
  res.on('close', () => ac.abort());

  if (scanRunning) {
    send('fail', { message: 'Another comparison is already running. Please wait for it to finish.' });
    return res.end();
  }
  scanRunning = true;
  const t0 = Date.now();

  try {
    const newPath = cleanPath(req.query.newPath);
    const oldPath = cleanPath(req.query.oldPath);
    const rules = String(req.query.rules || 'passport').split(',');
    if (!req.query.newPath || !req.query.oldPath) throw new Error('Please choose both folders.');
    await assertDir(newPath);
    await assertDir(oldPath);

    send('phase', { phase: 'discover', label: 'Finding PDF files…' });
    const [newFiles, oldFiles] = await Promise.all([findPdfs(newPath), findPdfs(oldPath)]);
    send('discovered', { newCount: newFiles.length, oldCount: oldFiles.length });
    if (!newFiles.length) throw new Error('No PDF files were found in the NEW folder.');
    if (!oldFiles.length) throw new Error('No PDF files were found in the OLD folder.');

    const total = newFiles.length + oldFiles.length;
    let done = 0;
    let lastEmit = 0;
    const tick = (rec, side) => {
      done++;
      knownFiles.add(rec.path);
      const now = Date.now();
      if (now - lastEmit > 120 || done === total) {
        lastEmit = now;
        send('progress', { done, total, side, current: rec.name });
      }
    };

    send('phase', { phase: 'new', label: 'Reading new files…' });
    const newRecs = await extractAll(newFiles, { rootDir: newPath, signal: ac.signal, onItem: (r) => tick(r, 'new') });
    if (ac.signal.aborted) return;
    send('phase', { phase: 'old', label: 'Reading old archive…' });
    const oldRecs = await extractAll(oldFiles, { rootDir: oldPath, signal: ac.signal, onItem: (r) => tick(r, 'old') });
    if (ac.signal.aborted) return;

    send('phase', { phase: 'match', label: 'Matching records…' });
    const results = matchRecords(newRecs, oldRecs, rules);

    const errors = [...newRecs, ...oldRecs]
      .filter((r) => r.error || !r.data?.hasText || (!r.data.passportNo && !r.data.nid && !r.data.fullName))
      .map((r) => ({
        path: r.path,
        name: r.name,
        reason: r.error || (!r.data?.hasText ? 'No text layer (scanned image PDF)' : 'No applicant fields detected'),
      }));

    send('done', {
      newPath,
      oldPath,
      rules,
      stats: {
        newCount: newRecs.length,
        oldCount: oldRecs.length,
        matched: results.filter((r) => r.matches.length).length,
        cached: [...newRecs, ...oldRecs].filter((r) => r.cached).length,
        errors: errors.length,
        ms: Date.now() - t0,
      },
      results,
      errors,
    });
  } catch (err) {
    send('fail', { message: err.message });
  } finally {
    scanRunning = false;
    res.end();
  }
});

// ---------- search (Server-Sent Events) ----------

app.get('/api/search', async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const ac = new AbortController();
  res.on('close', () => ac.abort());

  if (scanRunning) {
    send('fail', { message: 'Another scan is already running. Please wait for it to finish.' });
    return res.end();
  }
  scanRunning = true;
  const t0 = Date.now();

  try {
    const dir = cleanPath(req.query.path);
    const field = SEARCH_FIELDS[req.query.field] ? String(req.query.field) : 'passport';
    const queries = parseQueries(req.query.q || '');
    if (!req.query.path) throw new Error('Please choose a folder to search.');
    if (!queries.length) throw new Error('Please type something to search for.');
    await assertDir(dir);

    send('phase', { label: 'Finding PDF files…' });
    const files = await findPdfs(dir);
    if (!files.length) throw new Error('No PDF files were found in this folder.');
    send('discovered', { count: files.length });

    send('phase', { label: 'Searching PDFs…' });
    let done = 0;
    let lastEmit = 0;
    const recs = await extractAll(files, {
      rootDir: dir,
      signal: ac.signal,
      onItem: (rec) => {
        done++;
        knownFiles.add(rec.path);
        const now = Date.now();
        if (now - lastEmit > 120 || done === files.length) {
          lastEmit = now;
          send('progress', { done, total: files.length, current: rec.name });
        }
      },
    });
    if (ac.signal.aborted) return;

    const results = [];
    for (const rec of recs) {
      const m = searchRecord(rec, queries, field);
      if (m) results.push({ record: rec, ...m });
    }
    results.sort((a, b) => (a.record.data?.fullName || '').localeCompare(b.record.data?.fullName || ''));

    send('done', {
      path: dir,
      field,
      queries,
      notFound: queries.filter((q) => !results.some((r) => r.queries.includes(q))),
      stats: { scanned: recs.length, found: results.length, ms: Date.now() - t0 },
      results,
    });
  } catch (err) {
    send('fail', { message: err.message });
  } finally {
    scanRunning = false;
    res.end();
  }
});

// ---------- file actions ----------

function knownPath(p) {
  const abs = path.resolve(String(p || ''));
  if (!knownFiles.has(abs)) throw Object.assign(new Error('Unknown file'), { status: 403 });
  return abs;
}

app.get('/api/file', (req, res) => {
  try {
    const file = knownPath(req.query.path);
    res.type('application/pdf');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(file))}"`);
    fs.createReadStream(file).on('error', () => res.status(404).end()).pipe(res);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.post('/api/reveal', (req, res) => {
  try {
    const file = knownPath(req.body?.path);
    const open = req.body?.open;
    let cmd, args;
    if (process.platform === 'darwin') [cmd, args] = ['open', open ? [file] : ['-R', file]];
    else if (process.platform === 'win32') [cmd, args] = ['explorer.exe', open ? [file] : ['/select,', file]];
    else [cmd, args] = ['xdg-open', [open ? file : path.dirname(file)]];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.post('/api/cache/clear', async (_req, res) => {
  await clearCache();
  res.json({ ok: true });
});

// ---------- start ----------

function listen(port) {
  const server = app.listen(port, HOST, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  ✔ Old BDG Finder is running at ${url}\n`);
    if (!process.env.NO_OPEN) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
      spawn(opener, [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < START_PORT + 20) listen(port + 1);
    else throw err;
  });
}
listen(START_PORT);
