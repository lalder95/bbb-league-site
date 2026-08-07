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
- Sleeper API reference: consult [public/Sleeper API_files/Sleeper_API_Endpoints_Documented_and_Undocumented.csv](public/Sleeper%20API_files/Sleeper_API_Endpoints_Documented_and_Undocumented.csv) for documented and observed endpoints, parameters, caching guidance, and source URLs before adding new Sleeper integrations.

### Draft Order utilities
- Server-side calculator: `src/utils/draftOrderCalculator.js`
  - Use from API routes / server code when you need a canonical draft order.
  - Exports:
    - `resolveTargetDraftSeason({ leagueId })` (leagueYear + 1 unless a non-complete draft exists)
    - `calculateDraftOrderForLeague({ leagueId, targetSeason, applyRoundOneTrades })` (MaxPF + bracket + traded picks)
- Client hook: `src/hooks/useDraftOrder.js`
  - Use from client components when you just need the computed order.
  - Fetches `/api/debug/draft-order?leagueId=...` and returns `{ loading, error, data }`.
  - Example usage:
    - `const { loading, error, data } = useDraftOrder({ leagueId });`
    - Draft order entries are in `data.draft_order`.

### Player profile card
- Component: `src/app/my-team/components/PlayerProfileCard.js`
  - Purpose: single player “card” UI used in multiple places (e.g., trade / pick modals) that can expand and show contract + ESPN info.
  - Data sources:
    - Contracts: prefers `contracts` prop; otherwise fetches CSV from `https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv`.
    - Player image: prefers `public/players/cardimages/index.json` match; otherwise falls back to Cloudinary `res.cloudinary.com/.../<normalized>.png`, then position defaults.
    - ESPN info: only fetched when `expanded === true` to avoid N×M network calls.
      - Uses internal API routes (`/api/espn/scoreboard`, `/api/espn/summary`) and a small client-side cache with TTL.
  - Patterns/gotchas:
    - Avoid rendering raw objects/arrays in JSX; use the component’s safe display helpers.
    - Keep ESPN fetches behind the `expanded` gate and use the existing cached fetch helper to avoid spamming ESPN.
    - When adding new UI fields, ensure they degrade gracefully when contract rows are missing or ESPN has no boxscore.

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

### Notification system
- Server utility: `src/utils/notificationUtils.js`
  - `createNotification(userId, { title, message, link?, type? })` — inserts a notification into MongoDB for a single user AND fires a Web Push to any saved subscriptions. `userId` = `session.user.username`.
  - `createNotificationForMany(userIds[], options)` — batch version; returns `{ created, errors }`.
  - Import from API routes / server-side code only (uses `web-push` which is Node-only).
- MongoDB collections (in `bbb-league` db):
  - `notifications` — per-user notification records. Schema: `{ userId, title, message, link, type, read, pushed, createdAt }`.
  - `pushSubscriptions` — Web Push subscription objects per user. Schema: `{ userId, subscription: { endpoint, keys }, createdAt, updatedAt }`.
- DB helpers in `src/lib/db-helpers.js`: `createNotificationRecord`, `getNotificationsForUser`, `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`, `savePushSubscription`, `removePushSubscription`, `getPushSubscriptionsForUser`, `getAllPushSubscriptions`.
- API surface:
  - `GET /api/notifications` — current user's notifications (newest first, limit 50).
  - `PATCH /api/notifications/:id` — mark one as read. `DELETE` — dismiss one.
  - `POST /api/notifications/mark-all-read` — mark all read.
  - `GET /api/notifications/vapid-key` — public VAPID key (safe to expose).
  - `POST/DELETE /api/notifications/subscribe` — save/remove a push subscription object.
  - `POST /api/admin/notifications` — admin broadcast: `{ userIds: ['all'|'username',...], title, message, link? }`.
- UI components:
  - `src/components/NotificationBell.js` — bell icon with unread badge; polls `/api/notifications` every 60s; toggles `NotificationModal`.
  - `src/components/NotificationModal.js` — slide-in panel from top-right; marks all read on open; individual dismiss and click-to-navigate.
  - Rendered inside `Navigation.js`: desktop — left of Logout button; mobile — far-left of header, logo absolute-centered, hamburger far-right.
- PWA / push infrastructure:
  - `public/manifest.json` — PWA web app manifest (required for iOS 16.4+ push).
  - `public/sw.js` — service worker; handles `push` + `notificationclick` events.
  - `src/components/ServiceWorkerRegistration.js` — registers SW and subscribes the user on first visit (after permission grant). Rendered in `layout.js`.
- Push setup (do once per environment):
  1. Generate VAPID keys: `node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k, null, 2))"`
  2. Add to `.env.local` / Vercel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` (e.g. `mailto:admin@example.com`).
  3. Push is optional — if VAPID vars are absent, in-app notifications still work normally.

### Environment variables (required)
- `MONGODB_URI` – MongoDB connection string (throws on missing).
- `NEXTAUTH_SECRET` – NextAuth JWT secret.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` – Web Push VAPID credentials (optional; push is skipped when absent).
- `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` – for image index generation and `/api/cloudinary-images`.
- `OPENAI_API_KEY` – for `assistant-gm-chat` API.

### Examples
- Add a new protected admin API: create `src/app/api/admin/foo/route.js`, read the session or token if needed, and rely on `middleware.js` to block non-admins.
- Add another OCR-enabled page: create UI under `src/app/trade/new-tool/page.js`, and add a matching header rule in `next.config.mjs` to enable COOP/COEP for that route pattern.

Notes for agents
- Prefer surgical edits. Respect pre/post hooks that generate assets.
- Avoid leaking or hardcoding secrets. If a script has inline credentials (e.g., `migrate-users.js`), treat it as legacy reference and do not propagate the pattern.
