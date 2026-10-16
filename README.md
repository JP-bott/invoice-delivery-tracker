 -# Invoice & Delivery Tracker

Plain **React + Vite + Tailwind + Recharts** single-page app. There is no Express/Node server: the only server-side code is one small Vercel function (`api/index.js`) that talks to Turso, so the database token never reaches the browser.

## Project layout
```
client/src/             React app: pages/, components/ (dashboard/, invoices/), utils/
api/index.js            the one Vercel function (calls server/node-adapter.js)
server/handler.js       framework-free API router: handle({method,path,query,body}) -> {status,body}
server/services/        validation, money, filters, invoice + dashboard queries
server/database/        libSQL client, schema, init, seed, copy-data
migrations/001_init.sql idempotent schema (mirrors server/database/schema.js; a test keeps them in sync)
vercel.json             build, output directory, rewrites
```

## Prerequisites
Node 20+ and npm are needed only to install, build and test (Vercel does this for you).

## Local development
```
npm install            # also creates package-lock.json (commit it)
npm run dev            # Vite only; it serves /api from the same function code
```
With no `TURSO_DATABASE_URL`, development uses a local SQLite file `./local.db`. To use Turso locally, copy `.env.example` to `.env` and fill it in (Vite loads it).

## Database
- Production database: **Turso (libSQL)**, unchanged from the original project. Schema is created automatically and idempotently on the first request (`CREATE ... IF NOT EXISTS`); it never drops or alters data.
- Manual init: `npm run db:init`, or `turso db shell <db-name> < migrations/001_init.sql`.
- Optional demo data (idempotent): `npm run db:seed`.
- **Moving existing records** from a local SQLite file into Turso (non-destructive: `INSERT OR IGNORE`, ids preserved):
  ```
  # .env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (target); SOURCE_DATABASE_URL=file:./local.db (default)
  node --env-file=.env server/database/copy-data.js --dry-run   # count only
  node --env-file=.env server/database/copy-data.js             # copy
  ```
  Records already in Turso are left untouched. If your data is already in Turso, nothing needs migrating.
- On Vercel a `file:` database URL is refused and a missing `TURSO_DATABASE_URL` returns HTTP 503 `DB_NOT_CONFIGURED`, because serverless storage is not persistent.

## Tests and build
```
npm test          # vitest: validation, money, API handler (temp DB), adapter, dates, config, migration file
npm run build     # vite build -> client/dist
```

## Deploy to Vercel
1. Push this folder to a Git repository (or use `vercel` CLI from this folder). Commit `package-lock.json`.
2. Create a Turso database and token: `turso db create invoice-tracker`, `turso db show invoice-tracker --url`, `turso db tokens create invoice-tracker`.
3. In Vercel: Add New Project, import the repository. Framework Preset: **Vite** or **Other**. The settings in `vercel.json` apply (build `npm run build`, output `client/dist`).
4. Project Settings, Environment Variables (Production and Preview): `TURSO_DATABASE_URL` (libsql://...), `TURSO_AUTH_TOKEN`.
5. Deploy. Verify: open the site; `GET /api/filters/clients` returns JSON (`[]` on an empty DB); create an invoice and reload to confirm it persists.
6. To bring existing records over, run the `copy-data.js` step above from your machine against the Turso URL.

## Business rules (unchanged)
Money is integer centavos; status / amount-paid rules are enforced server-side; delivery status is derived from Delivery Date; invoice numbers are trimmed and unique case-insensitively (SQLite NOCASE folds ASCII only); the dashboard excludes Cancelled except the status distribution and recent list; dates use Asia/Manila. Dashboard client/product filters are exact match; invoice-list filters are "contains".

## Not implemented (also absent from the original source)
Settings page and runtime Turso switching, demo login, CSV export, Top Products value/count toggle, Delivery Overview chart, row-click details on the recent list.

## Intentional differences from the original
- Express removed. The API is a plain function (`server/handler.js`) behind one Vercel function; the same code runs inside the Vite dev server.
- Schema runs in one batched round trip; a failed init is retried on the next request.
- Hardening: non-numeric ids give 404 (was 500); `sortBy`/dashboard names are checked with `Object.hasOwn`; malformed JSON gives a JSON 400.
- UI split into components; added labels, `aria` attributes, dialog semantics with Escape-to-close. Layout and behavior are otherwise the same.
