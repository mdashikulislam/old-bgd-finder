// Finds PDFs inside one folder that belong to the same applicant.

import { normName, normNid, normPassport, normEmail, normPhone } from './matcher.js';

const normAppId = (s) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

export const DUP_FIELDS = {
  any: { label: 'Any field', keys: ['passport', 'nid', 'email', 'phone', 'appId'] },
  passport: { label: 'Passport No.', keys: ['passport'] },
  nid: { label: 'NID / BRN', keys: ['nid'] },
  givenName: { label: 'Given Name', keys: ['givenName'] },
  surname: { label: 'Surname', keys: ['surname'] },
  email: { label: 'Email', keys: ['email'] },
  phone: { label: 'Phone', keys: ['phone'] },
  appId: { label: 'Application ID', keys: ['appId'] },
};

export const KEY_LABELS = {
  passport: 'Passport No.', nid: 'NID / BRN', givenName: 'Given Name', surname: 'Surname',
  email: 'Email', phone: 'Phone', appId: 'Application ID',
};

const RAW = {
  passport: (d) => d.passportNo, nid: (d) => d.nid, givenName: (d) => d.givenName, surname: (d) => d.surname,
  email: (d) => d.email, phone: (d) => d.mobile || d.phone, appId: (d) => d.applicationId,
};
const rawValue = (d, key) => (RAW[key] ? RAW[key](d) : '') || '';

function keysFor(d) {
  return {
    passport: normPassport(d.passportNo),
    nid: normNid(d.nid),
    givenName: normName(d.givenName),
    surname: normName(d.surname),
    email: normEmail(d.email),
    phone: normPhone(d.mobile) || normPhone(d.phone),
    appId: normAppId(d.applicationId),
  };
}

/**
 * Groups records that share a value for the chosen field. With "any", records
 * are chained together when they share any identifying value (union-find), so
 * A=B by passport and B=C by phone puts all three in one group.
 *
 * @returns [{ keys: [{ key, value }], records: [rec] }] sorted by size, then value
 */
export function findDuplicates(recs, field = 'any') {
  const f = DUP_FIELDS[field] || DUP_FIELDS.any;
  const items = recs.filter((r) => r.data).map((r, i) => ({ i, rec: r, k: keysFor(r.data) }));

  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { parent[find(a)] = find(b); };

  const byValue = new Map(); // `${key}|${value}` -> [item index]
  for (const it of items) {
    for (const key of f.keys) {
      const v = it.k[key];
      if (!v) continue;
      const id = `${key}|${v}`;
      if (!byValue.has(id)) byValue.set(id, []);
      byValue.get(id).push(it.i);
    }
  }
  const shared = []; // [key, value, indices] seen by 2+ files
  for (const [id, idx] of byValue) {
    if (idx.length < 2) continue;
    const [key, value] = [id.slice(0, id.indexOf('|')), id.slice(id.indexOf('|') + 1)];
    shared.push({ key, value, idx });
    for (let j = 1; j < idx.length; j++) union(idx[0], idx[j]);
  }

  const groups = new Map();
  for (const it of items) {
    const root = find(it.i);
    if (!groups.has(root)) groups.set(root, { keys: [], records: [] });
    groups.get(root).records.push(it.rec);
  }
  for (const s of shared) {
    const g = groups.get(find(s.idx[0]));
    const shown = s.idx.map((i) => rawValue(items[i].rec.data, s.key)).find(Boolean) || s.value;
    if (!g.keys.some((k) => k.key === s.key && k.value === shown)) g.keys.push({ key: s.key, value: shown });
  }

  return [...groups.values()]
    .filter((g) => g.records.length > 1)
    .map((g) => ({ ...g, records: g.records.sort((a, b) => a.path.localeCompare(b.path)) }))
    .sort((a, b) => b.records.length - a.records.length || (a.keys[0]?.value || '').localeCompare(b.keys[0]?.value || ''));
}
