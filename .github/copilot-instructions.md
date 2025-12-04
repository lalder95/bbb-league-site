## Copilot instructions for this repository

These notes make AI coding agents productive quickly in this Next.js 15 app (App Router) for the BBB fantasy football league. Keep responses concrete, reference real files, and follow the patterns below.

### Architecture and routing
- Framework: Next.js 15 with the App Router under `src/app/**`; React 19; Tailwind CSS.
- Public assets live in `public/**` (e.g., `public/players/cardimages/index.json`, `public/tesseract/**`).
- API routes are colocated at `src/app/api/*/route.js`. They return JSON via Web standard `Response`/`NextResponse`.
  - Example: `src/app/api/assistant-gm-chat/route.js` uses `openai` and sets `export const runtime = 'nodejs'` to force Node on Vercel.
- Auth and access control:
  - NextAuth credentials provider at `src/app/api/auth/[...nextauth]/route.js` (Mongo-backed). JWT strategy; session fields include `username`, `role`, `sleeperId`.
  - Global `middleware.js` enforces auth, redirects to `/login` with `callbackUrl`, and restricts `/admin/**` to `token.role === 'admin'`.

### Data and services
- Database: MongoDB Atlas via `src/lib/mongodb.js` (connection cached in dev). Requires `MONGODB_URI`.
- Cloudinary: Build-time/dev-time image index is generated to `public/players/cardimages/index.json` by `scripts/generateCardImageIndex.js` using `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`.
- OCR (tesseract.js): Trade tools rely on cross-origin isolation and local assets under `public/tesseract/**`.
  - Headers for isolation are applied only to `/trade/:path*` in `next.config.mjs` using `COOP/COEP (credentialless)`.
  - Assets can be fetched via `npm run setup:tesseract` which downloads and pins worker/wasm/lang data.
- External league data: Utilities in `src/utils/*` wrap Sleeper API (e.g., `sleeperUtils.js`) and draft logic (`draftUtils.js`). Prefer using these helpers over re-implementing.

### Developer workflows
- Local dev: `npm run dev` (Next.js). Pre-hook runs `npm run generate-image-index`, which will call Cloudinary.
  - If Cloudinary creds are missing, create a stub `public/players/cardimages/index.json` as `[]` or set env in `.env.local` to avoid startup failures.
- Build: `npm run build` (also runs `generate-image-index` via `prebuild`). Start with `npm start`.
- Lint: `npm run lint` (Next lint rules; see `eslint.config.mjs`). Tailwind config in `tailwind.config.mjs`.
- Useful scripts in `scripts/`:
  - `generateCardImageIndex.js`: populates `public/players/cardimages/index.json` via Cloudinary API.
  - `fetchTesseractAssets.js`: downloads OCR assets to `public/tesseract/`.
  - `createDraft.js`: example Mongoose script for inserting a draft (expects `MONGODB_URI`).
  - `migrate-users.js`: one-off migration with a hardcoded URI; do not commit changes to secrets—treat as reference only.

### Conventions and patterns
- API routes: Keep them small, stateless, and explicit about runtime. Prefer `NextResponse.json({ ... }, { status })` and `cache: 'no-store'` for external fetches when appropriate (see `cloudinary-images/route.js`).
- Auth: Use NextAuth session in components; server-side gatekeeping is via `middleware.js` and per-route logic. Admin-only pages live under `src/app/admin/**`.
- Headers for special pages: If adding new OCR/WebAssembly features, extend `next.config.mjs` headers to include only the necessary paths (mimic the existing `/trade/:path*` block).
- Data helpers: Reuse `src/utils/draftUtils.js` and `src/utils/sleeperUtils.js` for pick formatting, salary calculations, and Sleeper state lookups.
- Images: Remote images must be whitelisted in `next.config.mjs` (`images.domains`). Cloudinary and Sleeper are already allowed.

### Environment variables (required)
- `MONGODB_URI` – MongoDB connection string (throws on missing).
- `NEXTAUTH_SECRET` – NextAuth JWT secret.
- `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` – for image index generation and `/api/cloudinary-images`.
- `OPENAI_API_KEY` – for `assistant-gm-chat` API.

### Examples
- Add a new protected admin API: create `src/app/api/admin/foo/route.js`, read the session or token if needed, and rely on `middleware.js` to block non-admins.
- Add another OCR-enabled page: create UI under `src/app/trade/new-tool/page.js`, and add a matching header rule in `next.config.mjs` to enable COOP/COEP for that route pattern.

Notes for agents
- Prefer surgical edits. Respect pre/post hooks that generate assets.
- Avoid leaking or hardcoding secrets. If a script has inline credentials (e.g., `migrate-users.js`), treat it as legacy reference and do not propagate the pattern.
