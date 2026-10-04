# Old BDG Finder

Scan a folder of **new** visa-application PDFs and find every applicant who already appears in an **old** archive folder. Sub-folders are scanned at any depth. There is no database: all processing happens locally.

## Run

```bash
npm install
npm start
```

For development, `npm run dev` runs it with nodemon, which restarts the server whenever `server.js` or `lib/` changes. Files in `public/` are served fresh, so a browser refresh is enough for them.

The app opens at http://localhost:4321.

## How it works

1. **Browse** opens your system's folder picker (Finder, Explorer or zenity). You can also paste a path.
2. **Compare** reads every PDF in both folders and extracts: passport no., NID / birth reg. no., given name, surname, date of birth, father's name, mother's name, mobile, email and application ID.
3. Each new applicant is checked against the old archive using the one rule you select (Passport No. by default):

| Rule             | Confidence |
|------------------|-----------:|
| Passport No.     | 100%       |
| NID / Birth Reg. | 100%       |
| Email            | 90%        |
| Phone            | 85%        |
| Given Name       | 50%        |
| Surname          | 40%        |

Name matching ignores word order and prefixes such as MD / MST / MOHAMMAD.

4. Results show where each match was found (full path), which fields match (green) and which differ (red). From there you can preview the PDF, show it in its folder, copy the path, or export everything to CSV.

## Search PDFs

The **Search PDFs** tab looks up one or more values in any folder (sub-folders included). Type a passport no., NID, given name, surname, email, phone or application ID. Separate several values with commas. "Look in" limits the search to one field, or leave it on **Any field**. Each matching PDF shows all of its extracted data with the matching values highlighted, plus its file location. Values that weren't found in any PDF are listed in red.

## Notes

- Extracted data is cached in `.cache/pdf-index.json`, keyed by file path, size and modified time, so later scans are close to instant. Clear it with the trash icon.
- PDFs are parsed in parallel worker threads.
- Scanned image-only PDFs have no text layer. They appear in the **Unreadable** tab.
- Set `PORT=5000` to change the port and `NO_OPEN=1` to stop the browser opening automatically.
