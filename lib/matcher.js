// Matches newly scanned applicants against an archive of older applications.

const NAME_NOISE = new Set(['MD', 'MOHAMMAD', 'MOHAMMED', 'MUHAMMAD', 'MOHAMMOD', 'MST', 'MOST', 'MOSAMMAT', 'MOSAMMOT', 'SK', 'SHEIKH']);

export const RULES = {
  passport: { label: 'Passport No.', score: 100 },
  nid: { label: 'NID / Birth Reg.', score: 100 },
  nameDob: { label: 'Name + Date of Birth', score: 85 },
  nameFather: { label: "Name + Father's name", score: 75 },
  nameOnly: { label: 'Name only', score: 40 },
};

export function normName(s) {
  if (!s) return '';
  const tokens = s
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t));
  return tokens.sort().join(' ');
}

const normDate = (s) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
const normNid = (s) => (s && s.length >= 10 ? s : '');
const normPassport = (s) => (s && s.length >= 6 ? s : '');

function keysFor(d) {
  const name = normName(d.fullName);
  const dob = normDate(d.dob);
  const father = normName(d.fatherName);
  return {
    passport: normPassport(d.passportNo),
    nid: normNid(d.nid),
    nameDob: name && dob ? `${name}|${dob}` : '',
    nameFather: name && father ? `${name}|${father}` : '',
    nameOnly: name.includes(' ') ? name : '', // single-token names are too ambiguous
  };
}

const COMPARE_FIELDS = [
  ['passportNo', 'Passport', (v) => v],
  ['nid', 'NID', (v) => v],
  ['fullName', 'Name', normName],
  ['dob', 'DOB', normDate],
  ['fatherName', 'Father', normName],
  ['motherName', 'Mother', normName],
  ['mobile', 'Mobile', (v) => v.replace(/\D/g, '').slice(-10)],
  ['email', 'Email', (v) => v.toLowerCase()],
];

function compareFields(a, b) {
  const same = [];
  const diff = [];
  for (const [key, label, norm] of COMPARE_FIELDS) {
    if (!a[key] || !b[key]) continue;
    (norm(a[key]) === norm(b[key]) ? same : diff).push(label);
  }
  return { same, diff };
}

/**
 * @param newRecs  records from the "new" folder (with .data)
 * @param oldRecs  records from the "old" folder (with .data)
 * @param enabled  array of rule keys to use
 */
export function matchRecords(newRecs, oldRecs, enabled = ['passport', 'nid', 'nameDob', 'nameFather']) {
  const rules = enabled.filter((r) => RULES[r]);
  const index = Object.fromEntries(rules.map((r) => [r, new Map()]));

  for (const rec of oldRecs) {
    if (!rec.data) continue;
    const k = keysFor(rec.data);
    for (const r of rules) {
      if (!k[r]) continue;
      if (!index[r].has(k[r])) index[r].set(k[r], []);
      index[r].get(k[r]).push(rec);
    }
  }

  return newRecs.map((rec) => {
    if (!rec.data) return { record: rec, matches: [] };
    const k = keysFor(rec.data);
    const found = new Map();
    for (const r of rules) {
      if (!k[r]) continue;
      for (const old of index[r].get(k[r]) || []) {
        if (old.path === rec.path) continue; // same file present in both trees
        if (!found.has(old.path)) found.set(old.path, { record: old, reasons: [], score: 0 });
        const m = found.get(old.path);
        m.reasons.push(r);
        m.score = Math.max(m.score, RULES[r].score);
      }
    }
    const matches = [...found.values()]
      .map((m) => ({ ...m, ...compareFields(rec.data, m.record.data) }))
      .sort((a, b) => b.score - a.score || b.same.length - a.same.length);
    return { record: rec, matches };
  });
}
