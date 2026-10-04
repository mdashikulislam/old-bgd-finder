// Worker thread: parses PDFs off the main thread so the UI stays responsive.
import { parentPort } from 'node:worker_threads';
import { extractPdf } from './extractor.js';

parentPort.on('message', async ({ id, file }) => {
  try {
    const data = await extractPdf(file);
    parentPort.postMessage({ id, data });
  } catch (err) {
    parentPort.postMessage({ id, error: err?.message || String(err) });
  }
});
