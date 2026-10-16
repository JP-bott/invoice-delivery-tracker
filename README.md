 -# Invoice & Delivery Tracker

Plain **React + Vite + Tailwind + Recharts** single-page app. There is no Express/Node server: the only server-side code is one small Vercel function (`api/index.js`) that talks to Turso, so the database token never reaches the browser.

## UI design system
The interface is a token-based design system built on the existing stack (no new component framework).
- **Tokens**: `client/src/index.css` defines semantic colour, radius, shadow, spacing and motion tokens for light and dark themes (`bg-surface`, `text-fg-muted`, `border-line`, `--chart-*`, `--aging-*`). Change a token once and the whole app follows.
- **Theme**: light/dark toggle in the top bar, saved in `localStorage`, follows the OS until you choose, applied before first paint (inline script in `client/index.html`).
- **Shell**: collapsible sidebar (drawer on phones), top bar with global search (opens `/invoices?q=...`), skip link, route transitions.
- **Shared components** (`client/src/components`): `Modal` (focus trap, Escape, scroll lock, inert background), `Toast` (raised only after the API answers), `ui.jsx` (tooltip/hover card, info tips, action menu, skeleton, empty state, page header), `StatusBadge` (icon + text + colour).
- **Font**: Inter Variable via `@fontsource-variable/inter` (self-hosted). Currency and counts use tabular numerals.
- Motion respects `prefers-reduced-motion`.

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
- Production database: **Turso (libSQL)**. Schema is created automatically and idempotently on the first request (`CREATE ... IF NOT EXISTS`). Existing databases receive only the nullable `due_date` column when it is missing; no records are dropped or rewritten.
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
Money is integer centavos; status / amount-paid rules are enforced server-side; delivery status is derived from Delivery Date; invoice numbers are trimmed and unique case-insensitively (SQLite NOCASE folds ASCII only); the dashboard excludes Cancelled except the status distribution and recent list; dates use Asia/Manila. Dashboard client/product filters are exact match; invoice-list filters are "contains". Dashboard analytics calculate outstanding balances from amount minus amount paid, classify invoices by the optional Due Date, and show a No due date category. Collected Revenue is grouped by invoice issue month because the schema does not store payment dates; this limitation is shown in the dashboard.

## UI changes that touch behaviour
- The old "Invoice pulse" card was removed from the dashboard: it bucketed unpaid invoices by *issue* date, which conflicted with the due-date based Outstanding Receivables chart. The `/api/dashboard/invoice-status` endpoint is unchanged.
- Dashboard KPI cards for Outstanding Balance and Pending Payments now open the unpaid invoice list; the invoice list's Payment filter gained an "Unpaid" option so that link shows the right value.
- Fixed: collapse/expand of client groups in the analytics dialog, and numeric sorting by amount in that dialog.
- "Add Invoice" in the sidebar/top bar opens the form via `/invoices?new=1`.
- Invoice rows show a derived "Overdue" tag (unpaid, due date before today, Asia/Manila). It is a display hint, separate from the stored payment status.

## Not implemented (also absent from the original source)
Settings page and runtime Turso switching, demo login, CSV export, Top Products value/count toggle, Delivery Overview chart, row-click details on the recent list.

## Intentional differences from the original
- Express removed. The API is a plain function (`server/handler.js`) behind one Vercel function; the same code runs inside the Vite dev server.
- Schema runs in one batched round trip; a failed init is retried on the next request.
- Hardening: non-numeric ids give 404 (was 500); `sortBy`/dashboard names are checked with `Object.hasOwn`; malformed JSON gives a JSON 400.
- UI split into components; added labels, `aria` attributes, dialog semantics with Escape-to-close. Layout and behavior are otherwise the same.
