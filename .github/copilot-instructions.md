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

### League Rulebook
- Official rulebook asset: `public/rulebook.pdf` and the `/rules` page. The PDF title is `Budget Blitz Rules and Guidelines`, and the rules page is the primary in-app entry point for viewing it.
- When answering league-policy questions, prefer the rulebook language and the rules page over ad hoc assumptions. If the user is asking about a policy edge case, check whether the rulebook PDF, the rules page, or the upcoming rule changes feed already covers it.
- Core league economics:
  - Salary cap is $300 per team.
  - Teams must stay under the cap at all times.
  - Cap space is not tradable.
- Contract types and operating windows:
  - Base contracts are awarded in RFA (Restricted Free Agency) or FA (Free Agency) auctions, run 1-4 years, and can be extended.
  - Extension contracts run 1-3 years, only apply to base contracts entering their final year, and can only be given from April through August.
  - Franchise tags are one-year deals priced at the top-10 average salary or the current salary plus 10%, whichever is higher. Each team gets one franchise tag per year and each player can only be franchise tagged once all-time (changing teams does not reset). Franchise tags can only be applied from February through March.
  - Rookie contracts are 3-year deals based on draft slot, cannot be extended, and enter RFA after expiration. Salary and Dead Cap Percentage vary by draft slot. 
  - Waiver and free-agent contracts are priced at the FAAB bid amount or $1, cannot be extended, can be franchise tagged, and each manager may designate one Waiver/Free Agent contract per year to go to RFA instead of free agency via the RFA tag.
- Dead money rules:
  - Dead money varies by contract. It is applied as a percentage of the remaining salary based on how the player was acquired. Each contract record specifies the applicable dead money percentage.
  - 0% dead money applies if the player retires. No change is given if they player leaves the NFL by other means (e.g. arrested, released).
- Rookie taxi squad:
  - Rookie salary gets a 75% discount in Year 1 when the player is placed on the taxi squad. Players may be added to the taxi squad only before the season begins. It locks at the start of the regular season. Players may be elevated to the regular roster at any point during the season.
- RFA (Restricted Free Agency) process:
  - Players become RFA (Restricted Free Agent) after a rookie contract expires or after a FA/Waiver tag designation.
  - Contract Value uses a weighted structure of 100% in Year 1, 80% in Year 2, 60% in Year 3, and 40% in Year 4.
  - The original owner can match the winning bid to retain the player. The match may be any number of years, so long as the overall Contract Value meets or exceeds the winning bid.
- Trade and season timing:
  - Trade deadline is the end of Week 10.
  - When a player is traded, all contracts with status "Active" or "Future" follow the player to the new owner. All "Expired" contracts remain with the original owner.
  - Teams may make trades that put them over the salary cap, so long as they get back under the cap before a fine is applied. See the "Fines" section for details.
  - No trades are allowed after the deadline.
  - "Temporary Trades" or any form of roster sharing or collusion are prohibited. Violations will result in fines and potential nullification of the trade. Commissioner discretion will be applied in all cases.
  - Collusion is defined as any agreement between two or more teams to manipulate the outcome of trades, games, or league events for mutual benefit.
  - Conditional trades (e.g. trades contingent on a team making the playoffs or achieving certain performance milestones) are prohibited. 
  - The regular season schedule uses Weeks 1-3 and 12-14 for division matchups, with Weeks 4-11 as inter-division matchups.
  - Playoffs start in Week 15.
    - Six teams make the playoffs: 3 division winners and 3 wildcards.
    - Division winners are seeds 1-3 and wildcards are seeds 4-6.
    - The top 2 seeds get first-round byes.
    - Playoff rounds are one week each.
    - Re-seeding is applied after each round of the playoffs. The highest remaining seed will always play the lowest remaining seed.
- Tiebreakers:
  - Head-to-head.
  - Points scored (higher).
  - Points against (higher).
  - Coin flip.
- Draft order:
  - Non-playoff teams draft in reverse Max PF order.
  - Playoff teams draft in reverse order of playoff finish, with the exception that 3rd and 4th place swap, and 5th and 6th place swap.
- Practical guidance for agents:
  - Use these rules when generating contract advice, trade analysis, roster planning, draft planning, and salary-cap explanations.
  - Keep responses consistent with the league's fantasy-only framing.
  - If you are unsure whether a rule has changed, check the rules page and the admin-managed upcoming rule changes feed before making assumptions.
- Fines
  - Fines are applied in the following senarios and at the following values. Fines always apply to the following season.
  - Example scenarios and values:
    - Failure to set starting lineup and playing an inactive player: $10
      - "Inactive player" is defined as a player not playing because of injury or bye week
      - Commissioner will replace the player with an appropriate substitute based on Sleeper projected scoring for the week.
    - Salary Cap Violation: $5
      - Offseason: Team is over the cap for 7 consecutive days.
      - Regular season: Team is over the cap at the kickoff of the first game of the week.
      - Playoffs: Team is over the cap at the kickoff of the first game of the week. Fine is raised to $10.

Notes for agents
- Prefer surgical edits. Respect pre/post hooks that generate assets.
- Avoid leaking or hardcoding secrets. If a script has inline credentials (e.g., `migrate-users.js`), treat it as legacy reference and do not propagate the pattern.
