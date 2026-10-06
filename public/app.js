(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONS = {
    pdf: '<svg class="pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  const state = {
    rules: [],
    enabledRules: store.get('rules', ['passport']),
    data: null,
    tab: 'matched',
    query: '',
    shown: 0,
    filtered: [],
    es: null,
    platform: '',
  };
  const PAGE = 40;

  // ---------- theme ----------
  const theme = store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  $('#themeBtn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    store.set('theme', t);
  };

  // ---------- toasts ----------
  function toast(msg, type = 'info', ms = 3800) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<div>${esc(msg)}</div>`;
    $('#toasts').append(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
  }

  // ---------- setup ----------
  $('#newPath').value = store.get('newPath', '');
  $('#oldPath').value = store.get('oldPath', '');
  ['newPath', 'oldPath'].forEach((id) => $('#' + id).addEventListener('change', (e) => store.set(id, e.target.value.trim())));
  $('#swapBtn').onclick = () => {
    const a = $('#newPath').value;
    $('#newPath').value = $('#oldPath').value;
    $('#oldPath').value = a;
    store.set('newPath', $('#newPath').value);
    store.set('oldPath', $('#oldPath').value);
  };

  fetch('/api/info').then((r) => r.json()).then((info) => {
    state.platform = info.platform;
    state.rules = info.rules;
    state.searchFields = info.searchFields;
    if (!state.enabledRules.some((k) => state.rules.some((r) => r.key === k))) {
      state.enabledRules = ['passport'];
      store.set('rules', state.enabledRules);
    }
    if (!state.searchFields.some((f) => f.key === state.searchField)) {
      state.searchField = 'passport';
      store.set('searchField', state.searchField);
    }
    renderRuleChips();
    renderFieldChips();
  });

  function renderRuleChips() {
    $('#ruleChips').innerHTML = state.rules.map((r) => `
      <button class="chip ${state.enabledRules.includes(r.key) ? 'on' : ''}" data-rule="${r.key}" title="Confidence ${r.score}%">
        <span class="dot"></span>${esc(r.label)}
      </button>`).join('');
  }
  $('#ruleChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.enabledRules = [chip.dataset.rule];
    store.set('rules', state.enabledRules);
    renderRuleChips();
  });

  // ---------- folder picking ----------
  let browserTarget = null;
  $$('[data-browse]').forEach((btn) => {
    btn.onclick = async () => {
      const target = btn.dataset.browse;
      const title = { newPath: 'Select the NEW files folder', oldPath: 'Select the OLD files folder', searchPath: 'Select a folder to search', analyzePath: 'Select a folder to analyze' }[target];
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Opening…';
      try {
        const res = await fetch('/api/pick-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }).then((r) => r.json());
        if (res.path) setPath(target, res.path);
        else if (res.unsupported) openBrowser(target);
      } catch {
        openBrowser(target);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    };
  });

  function setPath(target, p) {
    $('#' + target).value = p;
    store.set(target, p);
  }

  async function openBrowser(target) {
    browserTarget = target;
    $('#browserModal').classList.remove('hidden');
    await loadDir($('#' + target).value || '');
  }

  async function loadDir(p, drives = false) {
    const qs = new URLSearchParams({ path: p });
    if (drives) qs.set('drives', '1');
    const res = await fetch('/api/browse?' + qs).then((r) => r.json());
    if (res.error) return toast(res.error, 'error');
    $('#browserPathInput').value = res.path;
    $('#browserPathInput').placeholder = res.label || '';
    // parent === '' means "go to the drive list" (Windows); null means top of the tree.
    const hasParent = res.parent !== null && res.parent !== undefined;
    $('#browserUp').disabled = !hasParent;
    $('#browserUp').onclick = () => hasParent && loadDir(res.parent, res.parent === '');
    $('#browserInfo').textContent = res.path === '' ? `${res.dirs.length} drives` : `${res.dirs.length} folders · ${res.pdfCount} PDFs here`;
    $('#browserList').innerHTML = res.dirs.length
      ? res.dirs.map((d) => `<button class="dir-item" data-path="${esc(d.path)}">${ICONS.folder}<span>${esc(d.name)}</span></button>`).join('')
      : '<div class="list-empty">No sub-folders</div>';
    $$('.dir-item', $('#browserList')).forEach((el) => {
      el.onclick = () => loadDir(el.dataset.path);
    });
  }
  $('#browserPathInput').addEventListener('keydown', (e) => e.key === 'Enter' && loadDir(e.target.value));
  $('#browserSelect').onclick = () => {
    if (!$('#browserPathInput').value) return toast('Choose a drive or folder first.', 'error');
    setPath(browserTarget, $('#browserPathInput').value);
    closeModals();
  };

  function closeModals() {
    $$('.modal').forEach((m) => m.classList.add('hidden'));
    $('#viewerFrame').src = 'about:blank';
  }
  $$('[data-close]').forEach((b) => (b.onclick = closeModals));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => e.target === m && closeModals()));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModals());

  // ---------- compare ----------
  $('#compareBtn').onclick = startCompare;
  $('#cancelBtn').onclick = () => {
    state.es?.close();
    state.es = null;
    setRunning(false);
    toast('Scan cancelled.');
  };

  function setRunning(on, mode = state.mode) {
    $('#compareBtn').disabled = on;
    $('#searchBtn').disabled = on;
    $('#analyzeBtn').disabled = on;
    if (on) $(`.progress-slot[data-for="${mode}"]`).append($('#progressCard'));
    $('#progressCard').classList.toggle('hidden', !on);
    if (on) {
      $('#barFill').style.width = '0%';
      $('#progressCount').textContent = '';
      $('#progressCurrent').textContent = '';
      $('#progressPhase').textContent = 'Starting…';
    }
  }

  function startCompare() {
    const newPath = $('#newPath').value.trim();
    const oldPath = $('#oldPath').value.trim();
    if (!newPath || !oldPath) return toast('Please choose both the NEW and OLD folders.', 'error');
    store.set('newPath', newPath);
    store.set('oldPath', oldPath);

    setRunning(true);
    $('#emptyState').classList.add('hidden');
    const qs = new URLSearchParams({ newPath, oldPath, rules: state.enabledRules.join(',') });
    const es = new EventSource('/api/compare?' + qs);
    state.es = es;

    es.addEventListener('phase', (e) => { $('#progressPhase').textContent = JSON.parse(e.data).label; });
    es.addEventListener('discovered', (e) => {
      const d = JSON.parse(e.data);
      $('#progressCurrent').textContent = `Found ${d.newCount.toLocaleString()} new and ${d.oldCount.toLocaleString()} old PDFs`;
    });
    es.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data);
      $('#barFill').style.width = ((d.done / d.total) * 100).toFixed(1) + '%';
      $('#progressCount').textContent = `${d.done.toLocaleString()} / ${d.total.toLocaleString()}`;
      $('#progressCurrent').textContent = d.current;
    });
    es.addEventListener('done', (e) => {
      es.close();
      state.es = null;
      setRunning(false);
      state.data = JSON.parse(e.data);
      const m = state.data.stats.matched;
      toast(m ? `Found ${m} applicant${m > 1 ? 's' : ''} in the old archive.` : 'No matches found in the old archive.', m ? 'success' : 'info');
      state.tab = m ? 'matched' : 'all';
      renderResults();
    });
    es.addEventListener('fail', (e) => {
      es.close();
      state.es = null;
      setRunning(false);
      toast(JSON.parse(e.data).message, 'error', 6000);
      if (!state.data) $('#emptyState').classList.remove('hidden');
    });
    es.onerror = () => {
      if (!state.es) return;
      es.close();
      state.es = null;
      setRunning(false);
      toast('Lost connection to the server. Is it still running?', 'error', 6000);
    };
  }

  // ---------- results ----------
  function renderStats() {
    const s = state.data.stats;
    const items = [
      ['New files scanned', s.newCount, 'files', 'tone-green'],
      ['Old files scanned', s.oldCount, 'archive', 'tone-amber'],
      ['Applicants found in old', s.matched, 'users', 'tone-primary'],
      ['Unreadable PDFs', s.errors, 'warn', 'tone-red'],
      ['Scan time', fmtMs(s.ms), 'clock', 'tone-sky'],
    ];
    $('#stats').innerHTML = items.map(([label, v, icon, tone]) => `
      <div class="card stat">
        <div class="stat-icon ${tone}">${ICONS[icon]}</div>
        <div><div class="stat-value">${typeof v === 'number' ? v.toLocaleString() : v}</div><div class="stat-label">${label}</div></div>
      </div>`).join('');
  }

  const fmtMs = (ms) => (ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);

  function renderResults() {
    $('#resultsSection').classList.remove('hidden');
    renderStats();
    const { results, errors } = state.data;
    $('#countMatched').textContent = results.filter((r) => r.matches.length).length;
    $('#countUnmatched').textContent = results.filter((r) => !r.matches.length).length;
    $('#countErrors').textContent = errors.length;
    $('#countAll').textContent = results.length;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
    applyFilter();
  }

  function searchable(r) {
    const parts = [r.record.path];
    const add = (d) => d && parts.push(d.fullName, d.passportNo, d.nid, d.dob, d.fatherName, d.motherName, d.applicationId, d.mobile);
    add(r.record.data);
    r.matches?.forEach((m) => { parts.push(m.record.path); add(m.record.data); });
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function applyFilter() {
    const q = state.query.toLowerCase().trim();
    let list;
    if (state.tab === 'errors') {
      list = state.data.errors.filter((e) => !q || e.path.toLowerCase().includes(q));
    } else {
      list = state.data.results.filter((r) =>
        state.tab === 'all' ? true : state.tab === 'matched' ? r.matches.length : !r.matches.length);
      if (q) list = list.filter((r) => searchable(r).includes(q));
    }
    state.filtered = list;
    state.shown = 0;
    $('#resultsList').innerHTML = '';
    showMore();
  }

  function showMore() {
    const slice = state.filtered.slice(state.shown, state.shown + PAGE);
    const html = state.tab === 'errors' ? slice.map(errorHtml).join('') : slice.map(resultHtml).join('');
    if (!state.filtered.length) {
      $('#resultsList').innerHTML = `<div class="card list-empty">${state.query ? 'Nothing matches your search.' : 'Nothing to show here.'}</div>`;
    } else {
      $('#resultsList').insertAdjacentHTML('beforeend', html);
    }
    state.shown += slice.length;
    const rest = state.filtered.length - state.shown;
    $('#loadMoreBtn').classList.toggle('hidden', rest <= 0);
    $('#loadMoreBtn').textContent = `Show ${Math.min(rest, PAGE)} more (${rest} remaining)`;
  }
  $('#loadMoreBtn').onclick = showMore;

  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t || !state.data) return;
    state.tab = t.dataset.tab;
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    applyFilter();
  });
  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value; state.data && applyFilter(); }, 150);
  });

  const PALETTE = [['#6366f1', '#8b5cf6'], ['#0ea5e9', '#6366f1'], ['#10b981', '#0ea5e9'], ['#f59e0b', '#ef4444'], ['#ec4899', '#8b5cf6'], ['#14b8a6', '#22c55e']];
  function avatar(name) {
    const n = (name || '?').trim();
    const initials = n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    let h = 0;
    for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const [a, b] = PALETTE[h % PALETTE.length];
    return `<div class="avatar" style="background:linear-gradient(135deg,${a},${b})">${esc(initials)}</div>`;
  }

  function fileRow(rec) {
    const p = esc(rec.path);
    const win = state.platform === 'win32';
    const parts = String(rec.folder || '').split(/[\\/]+/).filter(Boolean);
    const root = !win && String(rec.folder || '').startsWith('/') ? '/' : '';
    const crumbs = parts.map((seg, i) => `<span class="crumb ${i === parts.length - 1 ? 'last' : ''}">${esc(seg)}</span>`)
      .join('<span class="crumb-sep">›</span>');
    return `
      <div class="file-row" title="${p}">
        <div class="file-head">
          ${ICONS.pdf}
          <div class="file-name">${esc(rec.name)}</div>
          <div class="file-actions">
            <button class="mini-btn" data-act="view" data-path="${p}" title="Preview PDF">${ICONS.eye}</button>
            <button class="mini-btn" data-act="reveal" data-path="${p}" title="Show in folder">${ICONS.folder}</button>
            <button class="mini-btn" data-act="copy" data-path="${p}" title="Copy full path">${ICONS.copy}</button>
          </div>
        </div>
        <div class="file-crumbs" aria-label="Folder path">${root ? '<span class="crumb root">/</span>' : ''}${crumbs}</div>
      </div>`;
  }

  function fieldsHtml(d) {
    const rows = [
      ['Passport', d.passportNo, true],
      ['NID / BRN', d.nid, true],
      ['Mobile', d.mobile, true],
      ['App. ID', d.applicationId, true],
    ].filter(([, v]) => v);
    return `<dl class="fields">${rows.map(([k, v, mono]) => `<dt>${k}</dt><dd class="${mono ? 'mono' : ''}">${esc(v)}</dd>`).join('')}</dl>`;
  }

  function resultHtml(r) {
    const d = r.record.data || {};
    const has = r.matches.length > 0;
    const person = `
      <div class="person">
        <div class="person-head">
          ${avatar(d.fullName)}
          <div>
            <span class="side-tag tone-green">New application</span>
            <div class="person-name">${esc(d.fullName || 'Unknown name')}</div>
            <div class="person-meta">${esc([d.gender, d.registrationDate && 'Registered ' + d.registrationDate].filter(Boolean).join(' · '))}</div>
          </div>
        </div>
        ${fieldsHtml(d)}
        ${fileRow(r.record)}
      </div>`;

    const matches = has
      ? `<div class="matches">
          <div class="matches-head">
            <span class="matches-title">Found in old archive · ${r.matches.length} file${r.matches.length > 1 ? 's' : ''}</span>
          </div>
          ${r.matches.map(matchHtml).join('')}
        </div>`
      : `<div class="matches"><div class="no-match">${ICONS.search} Not found in the old archive. This looks like a new applicant.</div></div>`;

    return `<article class="card result">${person}${matches}</article>`;
  }

  function matchHtml(m) {
    const d = m.record.data || {};
    const color = m.score >= 95 ? 'var(--green)' : m.score >= 70 ? 'var(--primary)' : 'var(--amber)';
    const ruleLabel = (k) => state.rules.find((r) => r.key === k)?.label || k;
    return `
      <div class="match">
        <div class="match-top">
          <div class="score" style="--p:${m.score};--c:${color}"><span>${m.score}%</span></div>
          <div class="match-info">
            <div class="match-name">${esc(d.fullName || 'Unknown')}</div>
            <div class="match-sub">${esc([d.passportNo && 'Passport ' + d.passportNo, d.dob, d.registrationDate && 'Applied ' + d.registrationDate].filter(Boolean).join(' · '))}</div>
          </div>
        </div>
        <div class="tags">
          ${m.reasons.map((k) => `<span class="tag reason">${ICONS.check}${esc(ruleLabel(k))}</span>`).join('')}
          ${m.same.filter((f) => !m.reasons.some((k) => ruleLabel(k).includes(f))).map((f) => `<span class="tag same">${ICONS.check}${esc(f)}</span>`).join('')}
          ${m.diff.map((f) => `<span class="tag diff" title="Value differs between new and old file">${ICONS.x}${esc(f)}</span>`).join('')}
        </div>
        ${fileRow(m.record)}
      </div>`;
  }

  function errorHtml(e) {
    return `
      <article class="card error-item">
        <div class="icon tone-red">${ICONS.warn}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:650">${esc(e.reason)}</div>
          ${fileRow({ path: e.path, name: e.name, folder: e.path.slice(0, e.path.length - e.name.length - 1) })}
        </div>
      </article>`;
  }

  // ---------- file actions ----------
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const p = btn.dataset.path;
    if (btn.dataset.act === 'view') {
      $('#viewerTitle').textContent = p.split(/[\\/]/).pop();
      $('#viewerFrame').src = '/api/file?path=' + encodeURIComponent(p);
      $('#viewerModal').classList.remove('hidden');
    } else if (btn.dataset.act === 'reveal') {
      const r = await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
      if (!r.ok) toast('Could not open the folder.', 'error');
    } else if (btn.dataset.act === 'copy') {
      try { await navigator.clipboard.writeText(p); toast('Path copied to clipboard.', 'success', 2000); }
      catch { toast(p, 'info', 6000); }
    }
  });

  // ---------- modes ----------
  state.mode = store.get('mode', 'compare');
  function setMode(mode) {
    state.mode = mode;
    store.set('mode', mode);
    $$('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#compareView').classList.toggle('hidden', mode !== 'compare');
    $('#searchView').classList.toggle('hidden', mode !== 'search');
    $('#analyzeView').classList.toggle('hidden', mode !== 'analyze');
    if (state.es) $(`.progress-slot[data-for="${mode}"]`).append($('#progressCard'));
    if (mode === 'search') $('#searchQuery').focus();
  }
  $('#modes').addEventListener('click', (e) => {
    const b = e.target.closest('.mode');
    if (b) setMode(b.dataset.mode);
  });
  setMode(state.mode);

  // ---------- search ----------
  state.searchField = store.get('searchField', 'passport');
  $('#searchPath').value = store.get('searchPath', '') || store.get('oldPath', '');
  $('#searchPath').addEventListener('change', (e) => store.set('searchPath', e.target.value.trim()));

  function renderFieldChips() {
    $('#fieldChips').innerHTML = (state.searchFields || []).map((f) => `
      <button class="chip ${state.searchField === f.key ? 'on' : ''}" data-field="${f.key}">
        <span class="dot"></span>${esc(f.label)}
      </button>`).join('');
  }
  $('#fieldChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.searchField = chip.dataset.field;
    store.set('searchField', state.searchField);
    renderFieldChips();
    $('#searchQuery').focus();
  });

  $('#searchBtn').onclick = startSearch;
  $('#searchQuery').addEventListener('keydown', (e) => e.key === 'Enter' && !state.es && startSearch());

  function startSearch() {
    const dir = $('#searchPath').value.trim();
    const q = $('#searchQuery').value.trim();
    if (!q) { $('#searchQuery').focus(); return toast('Type a value to search for.', 'error'); }
    if (!dir) return toast('Choose a folder to search in.', 'error');
    store.set('searchPath', dir);

    setRunning(true, 'search');
    $('#searchEmpty').classList.add('hidden');
    const es = new EventSource('/api/search?' + new URLSearchParams({ path: dir, q, field: state.searchField }));
    state.es = es;

    es.addEventListener('phase', (e) => { $('#progressPhase').textContent = JSON.parse(e.data).label; });
    es.addEventListener('discovered', (e) => {
      $('#progressCurrent').textContent = `Found ${JSON.parse(e.data).count.toLocaleString()} PDFs`;
    });
    es.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data);
      $('#barFill').style.width = ((d.done / d.total) * 100).toFixed(1) + '%';
      $('#progressCount').textContent = `${d.done.toLocaleString()} / ${d.total.toLocaleString()}`;
      $('#progressCurrent').textContent = d.current;
    });
    es.addEventListener('done', (e) => {
      es.close();
      state.es = null;
      setRunning(false);
      state.search = JSON.parse(e.data);
      state.searchShown = 0;
      renderSearch();
    });
    es.addEventListener('fail', (e) => {
      es.close();
      state.es = null;
      setRunning(false);
      toast(JSON.parse(e.data).message, 'error', 6000);
      if (!state.search) $('#searchEmpty').classList.remove('hidden');
    });
    es.onerror = () => {
      if (!state.es) return;
      es.close();
      state.es = null;
      setRunning(false);
      toast('Lost connection to the server. Is it still running?', 'error', 6000);
    };
  }

  function renderSearch() {
    const s = state.search;
    $('#searchResultsSection').classList.remove('hidden');
    const fieldLabel = state.searchFields?.find((f) => f.key === s.field)?.label || s.field;
    $('#searchSummary').innerHTML = `
      <strong>${s.stats.found.toLocaleString()} PDF${s.stats.found === 1 ? '' : 's'} found</strong>
      <span>in ${s.stats.scanned.toLocaleString()} scanned · ${esc(fieldLabel)} · ${fmtMs(s.stats.ms)}</span>
      ${s.notFound.map((q) => `<span class="tag diff" title="No PDF contains this value">${ICONS.x}${esc(q)}</span>`).join('')}`;
    $('#searchResultsList').innerHTML = s.results.length ? '' : `<div class="card list-empty">No PDF in this folder contains “${esc(s.queries.join(', '))}”.</div>`;
    state.searchShown = 0;
    showMoreSearch();
  }

  function showMoreSearch() {
    const list = state.search.results;
    const slice = list.slice(state.searchShown, state.searchShown + PAGE);
    $('#searchResultsList').insertAdjacentHTML('beforeend', slice.map(foundHtml).join(''));
    state.searchShown += slice.length;
    const rest = list.length - state.searchShown;
    $('#searchMoreBtn').classList.toggle('hidden', rest <= 0);
    $('#searchMoreBtn').textContent = `Show ${Math.min(rest, PAGE)} more (${rest} remaining)`;
  }
  $('#searchMoreBtn').onclick = showMoreSearch;

  function highlight(value, queries) {
    let html = esc(value);
    for (const q of queries) {
      const words = q.split(/\s+/).filter((w) => w.length >= 2);
      for (const w of words) {
        const re = new RegExp(`(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        html = html.replace(re, '<mark>$1</mark>');
      }
    }
    return html;
  }

  // Fields marked `onHit` are only shown when the search matched them.
  const DATA_FIELDS = [
    ['givenName', 'Given name'], ['surname', 'Surname'],
    ['passportNo', 'Passport No.', true], ['nid', 'NID / BRN', true], ['dob', 'Date of birth'],
    ['fatherName', 'Father', false, true], ['motherName', 'Mother', false, true],
    ['mobile', 'Mobile', true], ['email', 'Email', true],
    ['applicationId', 'Application ID', true], ['visaType', 'Visa type'], ['journeyDate', 'Journey date'],
  ];

  function foundHtml(r) {
    const d = r.record.data || {};
    const hits = new Set(r.hits);
    // name searches hit fullName; show that on the given name / surname boxes
    if (hits.has('fullName')) {
      const words = r.queries.flatMap((q) => q.toUpperCase().split(/\s+/)).filter((w) => w.length >= 2);
      for (const k of ['givenName', 'surname']) {
        if (d[k] && words.some((w) => d[k].toUpperCase().split(/\s+/).some((n) => n.startsWith(w)))) hits.add(k);
      }
    }
    const cells = DATA_FIELDS.filter(([k, , , onHit]) => d[k] && (!onHit || hits.has(k))).map(([k, label, mono]) => `
      <div class="datum ${hits.has(k) ? 'hit' : ''}">
        <div class="datum-label">${label}</div>
        <div class="datum-value ${mono ? 'mono' : ''}">${hits.has(k) ? highlight(d[k], r.queries) : esc(d[k])}</div>
      </div>`).join('');
    return `
      <article class="card found">
        <div class="person">
          <div class="person-head">
            ${avatar(d.fullName)}
            <div>
              <div class="person-name">${hits.has('fullName') ? highlight(d.fullName, r.queries) : esc(d.fullName || 'Unknown name')}</div>
              <div class="person-meta">${esc(r.record.relFolder === '.' ? 'Top folder' : r.record.relFolder)}</div>
            </div>
          </div>
          ${fileRow(r.record)}
        </div>
        <div class="found-data"><div class="data-grid">${cells || '<span class="muted">No form fields detected in this PDF.</span>'}</div></div>
      </article>`;
  }

  // ---------- analyzer ----------
  const ANALYZE_COLS = [
    ['givenName', 'Given Name'], ['surname', 'Surname'], ['applicationId', 'Application ID', true],
    ['nid', 'NID', true], ['phone', 'Phone No', true],
    ['email', 'Email Address'], ['registrationDate', 'Web Registration Date', true],
  ];
  const analyzeValue = (d, k) => (k === 'phone' ? d.phone || d.mobile || '' : d[k] || '');

  // Web registrations stay valid for 30 days.
  const REG_VALID_DAYS = 30;
  const REG_WARN_DAYS = 5;
  const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  function parseFormDate(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/);
    if (!m) return null;
    const mon = MONTHS[m[2].toUpperCase()];
    if (mon === undefined) return null;
    return new Date(Number(m[3]), mon, Number(m[1]));
  }
  /** Returns { age, left, status } for a registration date, or null when the date is unreadable. */
  function registrationStatus(dateStr) {
    const d = parseFormDate(dateStr);
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const age = Math.floor((today - d) / 86400000);
    const left = REG_VALID_DAYS - age;
    const status = age >= REG_VALID_DAYS ? 'expired' : left < REG_WARN_DAYS ? 'expiring' : 'ok';
    return { age, left, status };
  }
  function registrationBadge(st) {
    if (!st) return '';
    if (st.status === 'expired') {
      const over = st.age - REG_VALID_DAYS;
      return `<span class="tag diff" title="Registered ${st.age} days ago">${ICONS.x}${over === 0 ? 'Expired today' : `Expired ${over} day${over === 1 ? '' : 's'} ago`}</span>`;
    }
    if (st.status === 'expiring') return `<span class="tag warn" title="Registered ${st.age} days ago">${ICONS.clock}${st.left === 0 ? 'Expires today' : `${st.left} day${st.left === 1 ? '' : 's'} left`}</span>`;
    return '';
  }

  $('#analyzePath').value = store.get('analyzePath', '') || store.get('oldPath', '');
  $('#analyzePath').addEventListener('change', (e) => store.set('analyzePath', e.target.value.trim()));
  $('#analyzeBtn').onclick = startAnalyze;
  $('#analyzePath').addEventListener('keydown', (e) => e.key === 'Enter' && !state.es && startAnalyze());

  function startAnalyze() {
    const dir = $('#analyzePath').value.trim();
    if (!dir) return toast('Choose a folder to analyze.', 'error');
    store.set('analyzePath', dir);

    setRunning(true, 'analyze');
    $('#analyzeEmpty').classList.add('hidden');
    const es = new EventSource('/api/analyze?' + new URLSearchParams({ path: dir }));
    state.es = es;

    es.addEventListener('phase', (e) => { $('#progressPhase').textContent = JSON.parse(e.data).label; });
    es.addEventListener('discovered', (e) => {
      $('#progressCurrent').textContent = `Found ${JSON.parse(e.data).count.toLocaleString()} PDFs`;
    });
    es.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data);
      $('#barFill').style.width = ((d.done / d.total) * 100).toFixed(1) + '%';
      $('#progressCount').textContent = `${d.done.toLocaleString()} / ${d.total.toLocaleString()}`;
      $('#progressCurrent').textContent = d.current;
    });
    es.addEventListener('done', (e) => {
      es.close();
      state.es = null;
      setRunning(false);
      state.analyze = JSON.parse(e.data);
      $('#analyzeFilter').value = '';
      renderAnalyze();
    });
    es.addEventListener('fail', (e) => {
      es.close();
      state.es = null;
      setRunning(false);
      toast(JSON.parse(e.data).message, 'error', 6000);
      if (!state.analyze) $('#analyzeEmpty').classList.remove('hidden');
    });
    es.onerror = () => {
      if (!state.es) return;
      es.close();
      state.es = null;
      setRunning(false);
      toast('Lost connection to the server. Is it still running?', 'error', 6000);
    };
  }

  function analyzeFiltered() {
    const q = $('#analyzeFilter').value.trim().toLowerCase();
    const rows = state.analyze?.rows || [];
    if (!q) return rows;
    return rows.filter((r) => ANALYZE_COLS.some(([k]) => analyzeValue(r.data, k).toLowerCase().includes(q)) || r.path.toLowerCase().includes(q));
  }

  function renderAnalyze() {
    const a = state.analyze;
    $('#analyzeResultsSection').classList.remove('hidden');
    const list = analyzeFiltered();
    const filtered = list.length !== a.rows.length ? ` · ${list.length.toLocaleString()} shown` : '';
    const statuses = a.rows.map((r) => registrationStatus(r.data.registrationDate)?.status);
    const expired = statuses.filter((x) => x === 'expired').length;
    const expiring = statuses.filter((x) => x === 'expiring').length;
    $('#analyzeSummary').innerHTML = `
      <strong>${a.stats.readable.toLocaleString()} applicant${a.stats.readable === 1 ? '' : 's'}</strong>
      <span>from ${a.stats.scanned.toLocaleString()} PDFs · ${fmtMs(a.stats.ms)}${filtered}</span>
      ${expired ? `<span class="tag diff" title="Web registration is ${REG_VALID_DAYS} days old or more">${ICONS.x}${expired} expired</span>` : ''}
      ${expiring ? `<span class="tag warn" title="Fewer than ${REG_WARN_DAYS} days of registration left">${ICONS.clock}${expiring} expiring soon</span>` : ''}
      ${a.stats.unreadable ? `<span class="tag diff" title="PDFs with no readable form text">${ICONS.warn}${a.stats.unreadable} unreadable</span>` : ''}`;
    $('#analyzeList').innerHTML = list.length ? '' : '<div class="card list-empty">No applicants match this filter.</div>';
    state.analyzeList = list;
    state.analyzeShown = 0;
    showMoreAnalyze();
  }

  function analyzeCardHtml(r, i) {
    const d = r.data;
    const fullName = [d.givenName, d.surname].filter(Boolean).join(' ');
    const reg = registrationStatus(d.registrationDate);
    const regClass = reg && reg.status !== 'ok' ? reg.status : '';
    const cells = ANALYZE_COLS.map(([k, label, mono]) => {
      const v = analyzeValue(d, k);
      return `
      <div class="datum ${v ? '' : 'empty'} ${k === 'registrationDate' ? regClass : ''}">
        <div class="datum-label">${label}</div>
        <div class="datum-value ${mono ? 'mono' : ''}">${v ? esc(v) : '—'}</div>
      </div>`;
    }).join('');
    return `
      <article class="card found ${regClass}">
        <div class="person">
          <div class="person-head">
            ${avatar(fullName)}
            <div>
              <div class="person-name">${esc(fullName || 'Unknown name')}</div>
              <div class="person-meta">Applicant #${i + 1}${d.applicationId ? ' · ' + esc(d.applicationId) : ''}</div>
            </div>
          </div>
          ${registrationBadge(reg) ? `<div class="tags">${registrationBadge(reg)}</div>` : ''}
          ${fileRow(r)}
        </div>
        <div class="found-data"><div class="data-grid">${cells}</div></div>
      </article>`;
  }

  function showMoreAnalyze() {
    const list = state.analyzeList || [];
    const slice = list.slice(state.analyzeShown, state.analyzeShown + PAGE);
    $('#analyzeList').insertAdjacentHTML('beforeend', slice.map((r, i) => analyzeCardHtml(r, state.analyzeShown + i)).join(''));
    state.analyzeShown += slice.length;
    const rest = list.length - state.analyzeShown;
    $('#analyzeMoreBtn').classList.toggle('hidden', rest <= 0);
    $('#analyzeMoreBtn').textContent = `Show ${Math.min(rest, PAGE)} more (${rest} remaining)`;
  }
  $('#analyzeMoreBtn').onclick = showMoreAnalyze;
  let analyzeFilterTimer;
  $('#analyzeFilter').addEventListener('input', () => {
    clearTimeout(analyzeFilterTimer);
    analyzeFilterTimer = setTimeout(() => state.analyze && renderAnalyze(), 120);
  });

  $('#analyzeExportBtn').onclick = () => {
    if (!state.analyze) return;
    const rows = [[...ANALYZE_COLS.map(([, label]) => label), 'File']];
    for (const r of analyzeFiltered()) rows.push([...ANALYZE_COLS.map(([k]) => analyzeValue(r.data, k)), r.path]);
    downloadCsv(rows, 'bdg-analyze');
  };

  // ---------- export ----------
  $('#exportBtn').onclick = () => {
    if (!state.data) return;
    const cols = ['Status', 'New Name', 'New Passport', 'New NID', 'New DOB', 'New Father', 'New File',
      'Old Name', 'Old Passport', 'Old NID', 'Old DOB', 'Old Father', 'Match Score', 'Matched By', 'Differences', 'Old File'];
    const rows = [cols];
    const ruleLabel = (k) => state.rules.find((r) => r.key === k)?.label || k;
    for (const r of state.data.results) {
      const d = r.record.data || {};
      const base = [d.fullName, d.passportNo, d.nid, d.dob, d.fatherName, r.record.path];
      if (!r.matches.length) rows.push(['NOT FOUND', ...base, '', '', '', '', '', '', '', '', '']);
      for (const m of r.matches) {
        const o = m.record.data || {};
        rows.push(['FOUND', ...base, o.fullName, o.passportNo, o.nid, o.dob, o.fatherName, m.score, m.reasons.map(ruleLabel).join('; '), m.diff.join('; '), m.record.path]);
      }
    }
    for (const e of state.data.errors) rows.push(['UNREADABLE', '', '', '', '', '', e.path, '', '', '', '', '', '', '', e.reason, '']);
    downloadCsv(rows, 'bdg-compare');
  };

  function downloadCsv(rows, prefix) {
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${prefix}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- cache ----------
  $('#clearCacheBtn').onclick = async () => {
    if (!confirm('Clear the extraction cache? The next comparison will read every PDF again.')) return;
    await fetch('/api/cache/clear', { method: 'POST' });
    toast('Cache cleared.', 'success');
  };
})();
