// Free-text search over extracted PDF records.

import { normName } from './matcher.js';

export const SEARCH_FIELDS = {
  any: { label: 'Any field' },
  passport: { label: 'Passport No.', keys: ['passportNo'], kind: 'id' },
  nid: { label: 'NID / BRN', keys: ['nid'], kind: 'digits' },
  name: { label: 'Name', keys: ['fullName'], kind: 'name' },
  parents: { label: "Father / Mother", keys: ['fatherName', 'motherName'], kind: 'name' },
  mobile: { label: 'Mobile / Phone', keys: ['mobile', 'phone'], kind: 'digits' },
  dob: { label: 'Date of birth', keys: ['dob'], kind: 'id' },
  appId: { label: 'Application ID', keys: ['applicationId'], kind: 'id' },
  email: { label: 'Email', keys: ['email'], kind: 'id' },
};

const SKIP_KEYS = new Set(['hasText', 'givenName', 'surname']);
const alnum = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const digits = (s) => String(s).replace(/\D/g, '');

function valueMatches(value, query, kind) {
  if (!value) return false;
  if (kind === 'digits') {
    const q = digits(query);
    return q.length >= 3 && digits(value).includes(q);
  }
  if (kind === 'name') {
    // every query word must appear in the name, in any order; numeric
    // queries (passport, NID) never count as names
    if (!/^[\p{L}\s.'-]+$/u.test(query)) return false;
    const words = normName(value).split(' ');
    const q = normName(query).split(' ').filter(Boolean);
    return q.length > 0 && q.every((w) => w.length >= 2 && words.some((n) => n.startsWith(w)));
  }
  const q = alnum(query);
  return q.length >= 2 && alnum(value).includes(q);
}

/** Split "A1234567, A7654321" or newline lists into separate queries. */
export function parseQueries(raw) {
  return [...new Set(String(raw).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Returns { hits: [fieldKey], queries: [matched query] } or null. */
export function searchRecord(rec, queries, field) {
  const d = rec.data || {};
  const hits = new Set();
  const matched = [];

  for (const q of queries) {
    let ok = false;
    if (field === 'any') {
      for (const [k, v] of Object.entries(d)) {
        if (SKIP_KEYS.has(k)) continue;
        const kind = k === 'fullName' || k === 'fatherName' || k === 'motherName' ? 'name'
          : /^\d[\d\s+-]*$/.test(q) && (k === 'nid' || k === 'mobile' || k === 'phone') ? 'digits' : 'id';
        if (valueMatches(v, q, kind)) { hits.add(k); ok = true; }
      }
      if (alnum(rec.name).includes(alnum(q)) && alnum(q).length >= 3) { hits.add('file'); ok = true; }
    } else {
      const f = SEARCH_FIELDS[field];
      for (const k of f.keys) if (valueMatches(d[k], q, f.kind)) { hits.add(k); ok = true; }
    }
    if (ok) matched.push(q);
  }
  return matched.length ? { hits: [...hits], queries: matched } : null;
}
