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
 * Returns one group per shared value: every (field, value) pair that appears in
 * two or more PDFs. With "any", every identifying field is checked, so a file
 * can appear in several groups (one per value it shares).
 *
 * @returns [{ key, label, value, records: [rec] }] sorted by size, then value
 */
export function findDuplicates(recs, field = 'any') {
  const f = DUP_FIELDS[field] || DUP_FIELDS.any;
  const items = recs.filter((r) => r.data).map((rec) => ({ rec, k: keysFor(rec.data) }));

  const byValue = new Map(); // `${key}|${value}` -> { key, value, records }
  for (const it of items) {
    for (const key of f.keys) {
      const v = it.k[key];
      if (!v) continue;
      const id = `${key}|${v}`;
      if (!byValue.has(id)) byValue.set(id, { key, label: KEY_LABELS[key], value: rawValue(it.rec.data, key) || v, records: [] });
      byValue.get(id).records.push(it.rec);
    }
  }

  return [...byValue.values()]
    .filter((g) => g.records.length > 1)
    .map((g) => ({ ...g, records: g.records.sort((a, b) => a.path.localeCompare(b.path)) }))
    .sort((a, b) => b.records.length - a.records.length || a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
}
