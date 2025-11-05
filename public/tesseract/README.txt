Place Tesseract assets here for self-hosting in production.
Required files (copy from node_modules/tesseract.js/dist and tesseract.js-core):
- tesseract.worker.min.js
- tesseract-core.wasm.js
- tesseract-core.wasm
- tesseract-core-simd.wasm.js
- tesseract-core-simd.wasm
- lang-data/eng.traineddata.gz (or eng.traineddata)

The app will prefer these local paths and fall back to jsDelivr CDN if missing.