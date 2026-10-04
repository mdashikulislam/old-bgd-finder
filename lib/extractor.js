// Extracts applicant data from visa-application style PDFs.
//
// The forms lay out "Label  Value" pairs on the same text line, so we group
// text items by their Y position, sort each line by X, and read the item that
// follows a known label. A regex pass over the full text acts as a fallback
// for PDFs that don't follow the form layout.

import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// label (normalized) -> field key
const LABELS = [
  [/^application id\s*:?\s*/i, 'applicationId', { inline: true }],
  [/^web registration date\s*:?\s*/i, 'registrationDate', { inline: true }],
  [/^surname/i, 'surname'],
  [/^given name/i, 'givenName'],
  [/^previous\/other name/i, 'previousName'],
  [/^gender$/i, 'gender'],
  [/^marital status$/i, 'maritalStatus'],
  [/^date of birth$/i, 'dob'],
  [/^religion$/i, 'religion'],
  [/^place of birth/i, 'placeOfBirth'],
  [/^country of birth$/i, 'countryOfBirth'],
  [/^citizenship\s*\/\s*national id/i, 'nid'],
  [/^passport no\.?$/i, 'passportNo'],
  [/^date of issue \(/i, 'passportIssueDate'],
  [/^date of expiry/i, 'passportExpiryDate'],
  [/^place of issue$/i, 'passportIssuePlace'],
  [/^phone no$/i, 'phone'],
  [/^mobile\s*\/\s*cell no$/i, 'mobile'],
  [/^email address$/i, 'email'],
  [/^father'?s$/i, 'fatherName'],
  [/^mother'?s$/i, 'motherName'],
  [/^type of visa required$/i, 'visaType'],
  [/^expected date of journey$/i, 'journeyDate'],
];

const ALL_LABEL_RES = [
  ...LABELS.map(([re]) => re),
  /^nationality/i, /^educational qualification/i, /^visible identification/i,
  /^current nationality/i, /^any other/i, /^address$/i, /^present$/i, /^permanent$/i,
  /^relation$/i, /^name$/i, /^prev\. nationality/i, /^place\/country of birth/i,
  /^no of entries/i, /^period of visa/i, /^port of/i, /^country of issue/i,
  /^passport\/ic no/i, /^naturalization$/i, /^signature$/i,
];

const isLabel = (s) => ALL_LABEL_RES.some((re) => re.test(s.trim()));
const EMPTY_VALUES = new Set(['', 'NA', 'N/A', 'NIL', 'NOT APPLICABLE', '-', ',', '.']);

function groupLines(items) {
  const lines = [];
  for (const it of items) {
    const str = it.str.trim();
    if (!str) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) < 2.5);
    if (!line) lines.push((line = { y, items: [] }));
    line.items.push({ x, str });
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

function parseLines(lines, data) {
  for (const line of lines) {
    const { items } = line;
    for (let i = 0; i < items.length; i++) {
      const text = items[i].str;
      for (const [re, key, opts] of LABELS) {
        if (!re.test(text) || data[key]) continue;
        if (opts?.inline) {
          const v = text.replace(re, '').trim();
          if (v) data[key] = v;
          break;
        }
        const next = items[i + 1];
        if (next && !isLabel(next.str)) data[key] = next.str.trim();
        break;
      }
    }
  }
}

function regexFallback(text, data) {
  const flat = text.replace(/\s+/g, ' ');
  if (!data.passportNo) {
    const m = flat.match(/passport\s*(?:no|number)\.?\s*:?\s*([A-Z]{1,2}\d{7,8})/i)
      || flat.match(/\b([A-Z]{1,2}\d{7})\b/);
    if (m) data.passportNo = m[1];
  }
  if (!data.nid) {
    const m = flat.match(/(?:national id|nid|birth reg(?:istration)?)[^0-9]{0,30}(\d{10}|\d{13}|\d{17})\b/i);
    if (m) data.nid = m[1];
  }
  if (!data.applicationId) {
    const m = flat.match(/\b(BGD[A-Z]{2}\d{6,}[A-Z0-9]*)\b/);
    if (m) data.applicationId = m[1];
  }
}

function clean(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const val = String(v).replace(/\s+/g, ' ').trim();
    if (!EMPTY_VALUES.has(val.toUpperCase())) out[k] = val;
  }
  if (out.passportNo) out.passportNo = out.passportNo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (out.nid) out.nid = out.nid.replace(/\D/g, '');
  if (out.givenName || out.surname) {
    out.fullName = [out.givenName, out.surname].filter(Boolean).join(' ');
  }
  return out;
}

export async function extractPdf(filePath) {
  const buf = await fs.readFile(filePath);
  const doc = await getDocument({
    data: new Uint8Array(buf),
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const data = {};
  let fullText = '';
  try {
    // Personal particulars live on page 1; only read further pages if needed.
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const lines = groupLines(content.items);
      parseLines(lines, data);
      fullText += lines.map((l) => l.items.map((i) => i.str).join(' ')).join('\n') + '\n';
      page.cleanup();
      if (data.passportNo && (data.surname || data.givenName)) break;
    }
  } finally {
    await doc.destroy();
  }

  regexFallback(fullText, data);
  const result = clean(data);
  result.hasText = fullText.trim().length > 0;
  return result;
}
