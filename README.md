 -# Invoice & Delivery Tracker

Plain **React + Vite + Tailwind + Recharts** single-page app. There is no Express/Node server: the only server-side code is one small Vercel function (`api/index.js`) that talks to Turso, so the database token never reaches the browser.

## UI design system
The interface is a token-based design system built on the existing stack (no new component framework).
- **Tokens**: `client/src/index.css` defines semantic colour, radius, shadow, spacing and motion tokens for light and dark themes (`bg-surface`, `text-fg-muted`, `border-line`, `--chart-*`, `--aging-*`). Change a token once and the whole app follows.
- **Theme**: light/dark toggle in the top bar, saved in `localStorage`, follows the OS until you choose, applied before first paint (inline script in `client/index.html`).
- **Shell**: collapsible sidebar (drawer on phones), top bar with global search (opens `/invoices?q=...`), skip link, route transitions.
- **Shared components** (`client/src/components`): `Modal` (focus trap, Escape, scroll lock, inert background), `Toast` (raised only after the API answers), `ui.jsx` (tooltip/hover card, info tips, action menu, skeleton, empty state, page header), `StatusBadge` (icon + text + colour).
- **Font**: Inter Variable via `@fontsource-variable/inter` (self-hosted). Currency and counts use tabular numerals.
- **Canvas**: the content area uses a subtle CSS dot grid (`.dot-canvas` in `index.css`: `#FAFBFC` base, `#DDE2E8` dots at 75% opacity, 24px spacing; dark theme uses faint white dots). Cards stay solid white with soft borders. Corner radii (`--radius-*` in the theme) are 2% larger than the previous scale.
- **Logo**: a placeholder is at `client/public/logo.png`. Replace it with your own file named `logo.png` (or `logo.jpg`; the app tries `.png` first, then `.jpg`, then a built-in icon). It is shown in the sidebar and used as the browser-tab icon. A square image works best.
- **Add Invoice** lives in one place, the top bar (icon only on phones); the sidebar, dashboard and invoices headers no longer repeat it.
- Motion respects `prefers-reduced-motion`.

## Project layout
```
client/src/             React app: pages/, components/ (dashboard/, invoices/), utils/
api/index.js            the one Vercel function (calls server/node-adapter.js)
server/handler.js       framework-free API router: handle({method,path,query,body}) -> {status,body}
server/services/        validation, money, filters, invoice + dashboard queries
server/database/        libSQL client, schema, init, seed, copy-data
migrations/001_init.sql idempotent schema (mirrors server/database/schema.js; a test keeps them in sync)
migrations/002_invoice_custom_fields.sql  additive tables for custom invoice fields (mirrors CUSTOM_FIELD_STATEMENTS; also test-checked)
migrations/003_invoice_items.sql  additive table for invoice line items (mirrors ITEM_STATEMENTS; also test-checked)
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
npm test          # vitest: validation, money, API handler (temp DB), adapter, dates, config, migration files, custom invoice fields
npm run build     # vite build -> client/dist
```

## Deploy to Vercel
1. Push this folder to a Git repository (or use `vercel` CLI from this folder). Commit `package-lock.json`.
2. Create a Turso database and token: `turso db create invoice-tracker`, `turso db show invoice-tracker --url`, `turso db tokens create invoice-tracker`.
3. In Vercel: Add New Project, import the repository. Framework Preset: **Vite** or **Other**. The settings in `vercel.json` apply (build `npm run build`, output `client/dist`).
4. Project Settings, Environment Variables (Production and Preview): `TURSO_DATABASE_URL` (libsql://...), `TURSO_AUTH_TOKEN`.
5. Deploy. Verify: open the site; `GET /api/filters/clients` returns JSON (`[]` on an empty DB); create an invoice and reload to confirm it persists.
6. To bring existing records over, run the `copy-data.js` step above from your machine against the Turso URL.

## Custom invoice fields (Settings > Invoice fields)
Add, edit, reorder and delete extra fields for the Add/Edit Invoice forms without touching code. Each field has a label, an input type (Text, Long text, Number, Date, Dropdown, Checkbox, Email, Link), a Required flag, a "show as a column" flag and, for dropdowns, its own list of options (add / rename / remove inside the field editor).
- **Data**: definitions live in `invoice_fields`; values in `invoice_custom_values` (one row per invoice + field, stored as text; an empty value is no row). The `invoices` table is not altered. The tables are created automatically on the first request (`CREATE ... IF NOT EXISTS`) and by `migrations/002_invoice_custom_fields.sql`; existing invoices are untouched.
- **API**: `GET/POST /api/invoice-fields`, `PUT /api/invoice-fields/:id`, `DELETE /api/invoice-fields/:id` (archive), `DELETE ...?permanent=1`, `POST .../:id/restore`, `PUT /api/invoice-fields/order`. Invoices accept and return `custom_fields: { "<fieldId>": "value" }`; validation errors come back as `fields.cf_<fieldId>`.
- **Safe deletes and edits**: *Delete* archives the field (hidden from forms, search, filters and the table) and keeps every saved value; it can be restored from "Deleted fields", or removed permanently (which erases its values). The input type is locked once any invoice has a value (Text and Long text may still swap). Removing or renaming a dropdown option never rewrites invoices; an invoice keeps its old value and can still be saved unchanged. A field missing from a save request is left exactly as stored, so a stale browser tab cannot wipe data.
- **Required** fields are enforced on create and on the next save of an invoice; reading and listing old invoices is never blocked. Limits: 30 active fields, 100 options per dropdown.
- **Search/filter/display**: global search also matches custom text/number/date/dropdown values (checkboxes are excluded); the filter panel gets one control per field (`cf_<id>` query parameters); fields flagged for the list appear as extra columns (a summary line on phones). Custom columns are not sortable, and the A5 invoice preview does not use custom fields. On the dashboard, custom fields can be used as filters when switched on under Settings > Dashboard filters.

## Multiple products/services per invoice
The Add/Edit Invoice form takes any number of products/services, each with a quantity (**Add Another** adds a row; up to 30 rows, quantity above 0 with up to 3 decimals).
- **Data**: rows live in `invoice_items` (`invoice_id`, `position`, `product_service`, `quantity`), created automatically on the first request and by `migrations/003_invoice_items.sql`. `invoices.product_service` is kept as the item names joined with ", " so search, the product filter, sorting and the dashboard keep working. Invoices saved earlier have no item rows and are read as one item with quantity 1; nothing is rewritten.
- **API**: invoices accept and return `items: [{ product_service, quantity }]`. A request with only `product_service` still works (one item, quantity 1). Validation errors come back as `items_<row>_product_service` / `items_<row>_quantity`.
- **Preview**: one row per item with its quantity. Only the invoice total is stored, so unit cost and amount are filled in for a single item; with several items they stay blank and the totals block shows the amount.
- **Limits**: the dashboard "Top products & services" chart and its exact-match product filter work on the joined text, so an invoice with several items appears as one combined entry there.
- The invoices list shows items as "Cement × 10, IT Services × 2", and shows — for empty CR No., Delivery Date, Remarks and Due Date.

## Dashboard filters (Settings > Dashboard filters)
Settings has two clearly separate panels (side by side on wide screens): **Invoice form** (product/service options and invoice fields) and **Dashboard filters**. The second one chooses which fields appear as filters above the dashboard and in what order.
- **Available filters**: Client, Product/Service, Payment status, Delivery status, and every active custom invoice field. Defaults match the old dashboard: only Client and Product/Service are on. **Date range** is always shown (it sets the period for every chart) and is not configurable. At most 8 filters can be on.
- **Controls on the dashboard**: dropdown fields and checkboxes are selects, date and number fields use matching inputs, text fields are "contains" boxes (applied after a short pause in typing). The KPI cards, charts, "View invoices" links and the page subtitle all use the active filters.
- **Data**: one JSON value in `schema_meta` (key `dashboard_filters`); no new table and no invoice data is touched. Archiving a custom field removes it from the list; restoring it brings back its on/off setting. New fields start switched off.
- **API**: `GET /api/dashboard-filters` returns every available filter with its control type, options and `enabled` flag; `PUT /api/dashboard-filters` takes `{ filters: [{ key, enabled }] }` in the desired order. Dashboard endpoints accept `paymentStatus`, `deliveryStatus` and `cf_<id>` query parameters.
- **Rules kept**: cancelled invoices stay excluded from dashboard figures, so Payment status offers Unpaid, Pending, Partially Paid and Paid. The dashboard product filter is still an exact match, and now also matches invoices that list that product among several items.
- **Long lists**: product options, invoice fields, dashboard filters and dropdown options show the first few entries with a "See More…" toggle ("Expand Options" in the field editor).

## Business rules (unchanged)
Money is integer centavos; status / amount-paid rules are enforced server-side; delivery status is derived from Delivery Date; invoice numbers are trimmed and unique case-insensitively (SQLite NOCASE folds ASCII only); the dashboard excludes Cancelled except the status distribution and recent list; dates use Asia/Manila. Dashboard client/product filters are exact match; invoice-list filters are "contains". Dashboard analytics calculate outstanding balances from amount minus amount paid, classify invoices by the optional Due Date, and show a No due date category. Collected Revenue is grouped by invoice issue month because the schema does not store payment dates; this limitation is shown in the dashboard.

## UI changes that touch behaviour
- The old "Invoice pulse" card was removed from the dashboard: it bucketed unpaid invoices by *issue* date, which conflicted with the due-date based Outstanding Receivables chart. The `/api/dashboard/invoice-status` endpoint is unchanged.
- Dashboard KPI cards for Outstanding Balance and Pending Payments now open the unpaid invoice list; the invoice list's Payment filter gained an "Unpaid" option so that link shows the right value.
- Fixed: collapse/expand of client groups in the analytics dialog, and numeric sorting by amount in that dialog.
- "Add Invoice" in the sidebar/top bar opens the form via `/invoices?new=1`.
- Invoice rows show a derived "Overdue" tag (unpaid, due date before today, Asia/Manila). It is a display hint, separate from the stored payment status.

## Dashboard KPIs (counts first)
The top cards answer "how many", as of today: Total Invoices (excluding cancelled), Pending Payments (Pending + Partially Paid with a balance), Overdue (unpaid and past the Due Date; invoices with no due date are not overdue), Delivered and Pending Deliveries. They ignore the date-range filter (client/product filters still apply). Peso amounts appear only in the hover card; clicking opens the matching invoices (Pending/Overdue in a searchable dialog grouped by client). The "Unpaid invoices by due date" doughnut follows the same rule. The collected-revenue, trend and top-client charts remain money charts and still use the date range.

## Invoice preview
An eye button in the Add/Edit Invoice form (and "Preview invoice" in each row's action menu) opens a print-ready Quandatics service invoice (A5) built from the form values, before anything is saved. Total Sales is the invoice amount treated as VAT-inclusive; the Sale type (VATable 12% / VAT-Exempt / Zero Rated) and Withholding tax selectors only affect the preview and are not stored. Address, TIN and P.O. No. are not part of the data model, so they print blank. Print uses the browser dialog and produces a single A5 page (`client/src/components/invoices/InvoicePreview.jsx`, `invoice-sheet.css`).

## Not implemented (also absent from the original source)
Settings page and runtime Turso switching, demo login, CSV export, Top Products value/count toggle, Delivery Overview chart, row-click details on the recent list.

## Intentional differences from the original
- Express removed. The API is a plain function (`server/handler.js`) behind one Vercel function; the same code runs inside the Vite dev server.
- Schema runs in one batched round trip; a failed init is retried on the next request.
- Hardening: non-numeric ids give 404 (was 500); `sortBy`/dashboard names are checked with `Object.hasOwn`; malformed JSON gives a JSON 400.
- UI split into components; added labels, `aria` attributes, dialog semantics with Escape-to-close. Layout and behavior are otherwise the same.
