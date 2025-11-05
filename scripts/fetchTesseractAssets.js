// Fetch and place Tesseract assets into public/tesseract for fastest, most reliable OCR
// Sources pinned to jsDelivr CDN for tesseract.js@4 and tesseract.js-core@4 to match app expectations

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'tesseract');

// Files we need locally and where to download them from
const files = [
  {
    urls: [
      'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
      'https://unpkg.com/tesseract.js@4/dist/worker.min.js',
    ],
    out: 'tesseract.worker.min.js', // rename to the path used by the app
  },
  {
    urls: [
      'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js',
      'https://unpkg.com/tesseract.js-core@4.0.0/tesseract-core.wasm.js',
    ],
    out: 'tesseract-core.wasm.js',
  },
  {
    urls: [
      'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm',
      'https://unpkg.com/tesseract.js-core@4.0.0/tesseract-core.wasm',
    ],
    out: 'tesseract-core.wasm',
  },
  {
    urls: [
      'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core-simd.wasm.js',
      'https://unpkg.com/tesseract.js-core@4.0.0/tesseract-core-simd.wasm.js',
    ],
    out: 'tesseract-core-simd.wasm.js',
  },
  {
    urls: [
      'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core-simd.wasm',
      'https://unpkg.com/tesseract.js-core@4.0.0/tesseract-core-simd.wasm',
    ],
    out: 'tesseract-core-simd.wasm',
  },
  {
    urls: [
      'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/lang-data/eng.traineddata.gz',
      'https://unpkg.com/tesseract.js@4/dist/lang-data/eng.traineddata.gz',
      'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
    ],
    out: path.join('lang-data', 'eng.traineddata.gz'),
  },
];

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function tryUrl(url, destAbs, retries = 1) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      await ensureDir(path.dirname(destAbs));
      await fs.promises.writeFile(destAbs, buf);
      return { ok: true };
    } catch (err) {
      if (attempt > retries + 1) break;
      if (attempt === retries + 1) {
        return { ok: false, error: err };
      }
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  return { ok: false, error: new Error('unknown error') };
}

(async () => {
  try {
    await ensureDir(OUT_DIR);
    const results = [];
    for (const f of files) {
      const outAbs = path.join(OUT_DIR, f.out);
      let ok = false; let lastErr;
      for (const url of f.urls) {
        process.stdout.write(`Downloading ${url} -> ${path.relative(process.cwd(), outAbs)} ... `);
        const result = await tryUrl(url, outAbs, 1);
        if (result.ok) { console.log('done'); ok = true; lastErr = undefined; break; }
        console.log(`failed (${result.error && (result.error.message || String(result.error))})`);
        lastErr = result.error;
      }
      results.push({ outAbs, ok, error: lastErr, urls: f.urls });
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      console.error('\nSome files failed to download:');
  for (const r of failed) console.error(` - ${r.urls && r.urls[0]}`);
      process.exitCode = 1;
    } else {
      console.log('\nTesseract assets downloaded successfully to public/tesseract');
    }
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
