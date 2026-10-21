 -# Invoice & Delivery Tracker

Plain **React + Vite + Tailwind + Recharts** single-page app. There is no Express/Node server: the only server-side code is one small Vercel function (`api/index.js`) that talks to Turso, so the database token never reaches the browser.

## UI design system
The interface is a token-based design system built on the existing stack (no new component framework).
- **Tokens**: `client/src/index.css` defines semantic colour, radius, shadow, spacing and motion tokens for light and dark themes (`bg-surface`, `text-fg-muted`, `border-line`, `--chart-*`, `--aging-*`). Change a token once and the whole app follows.
- **Theme**: light/dark toggle in the top bar, saved in `localStorage`, follows the OS until you choose, applied before first paint (inline script in `client/index.html`).
- **Shell**: collapsible sidebar (drawer on phones), top bar in three zones (page name, a recessed search field that `/` focuses and that opens `/invoices?q=...`, then today's Manila date, theme toggle and the single filled **Add Invoice** button; a hairline shadow appears once the page scrolls), skip link, route transitions.
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
migrations/004_invoice_item_pricing.sql  two nullable columns for unit cost and line amount (mirrors ITEM_PRICING_COLUMNS; also test-checked)
migrations/005_clients.sql  additive `clients` table plus nullable `client_tin` / `client_address` on invoices (mirrors CLIENT_STATEMENTS and INVOICE_CLIENT_COLUMNS; also test-checked)
shared/                 pure JS used by both the browser and the API: pricing.js (line/subtotal/VAT maths), invoiceNumber.js (SVI/SI format)
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
npm test          # vitest: validation, money, API handler (temp DB), adapter, dates, config, migration files, custom invoice fields, dashboard invoice overview
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

## Clients (Settings > Clients)
- **What it does**: register clients with a Name (required), TIN and Address (both optional) under Settings > Invoice form > Clients (add, edit, search once the list is long, delete). In the Add/Edit Invoice form the **Client Name** box suggests matching registered clients as you type (by name, or by TIN digits). Choosing one (click, arrow keys + Enter, or typing its exact name and leaving the field) fills the Name, TIN and Address, shows them under the field, and prints them in the invoice preview. Typing a name that is not registered still works: it is saved as typed, with no TIN or address. Editing the name away from a registered client clears its TIN and address again, so they never describe a different client.
- **Saved with the invoice**: each invoice keeps its own copy of `client_name`, `client_tin` and `client_address`. Editing or deleting a client in Settings never changes invoices already saved; to refresh an old invoice, open it and pick the client again. Opening and saving an old invoice without touching the client field keeps what it had.
- **Data**: registered clients live in `clients` (`name` unique, case-insensitive; `tin`, `address`). Two nullable TEXT columns are added to `invoices` automatically on the first request (`migrations/005_clients.sql` does the same by hand). Nothing is rewritten; older invoices read as having no TIN or address. `server/database/copy-data.js` copies the two columns when the source has them.
- **API**: `GET/POST /api/clients`, `PUT/DELETE /api/clients/:id`. Validation errors are HTTP 422 with `error.fields` (`name`, `tin`, `address`); a duplicate name is 409. TIN: digits, spaces and hyphens only, 9 to 14 digits (`TIN_DIGITS` in `server/services/clientService.js`). Invoices accept optional `client_tin` (max 30 characters) and `client_address` (max 300); leaving a key out of an update keeps the stored value, sending an empty string clears it.
- **Unchanged**: the invoice-list client filter, the dashboard's exact-match client filter and `GET /api/filters/clients` still work on the saved client name; picking a registered client just makes that name consistent.

## Multiple products/services, unit costs and automatic amounts
The Add/Edit Invoice form takes any number of products/services (**Add Another** adds a row; up to 30). Each row has its own **Product/Service, Unit Cost, Quantity** and a calculated **Amount**. Unit Cost (0 or more, max 2 decimals) and Quantity (above 0, max 3 decimals) are required; minus signs, letters and exponents cannot be typed and the API rejects them too.
- **Calculation** (`shared/pricing.js`, used by the form, the preview and the API, with integer centavo maths): `Line Amount = Unit Cost x Quantity` (rounded half-up to the centavo), `Subtotal = sum of line amounts`, and the saved **Invoice Amount = Subtotal**. The Invoice Amount field in the form is read-only and always derived; the API ignores any `amount` sent together with `items`.
- **Tax treatment is unchanged**: amounts are VAT-inclusive. VAT (12% for VATable sales, `net = round(total / 1.12)`, `VAT = total - net`) and withholding tax (on the net of VAT) are still worked out in the preview from the saved total, and the Sale type / Withholding selectors are still preview-only and not stored. There is no discount feature in the app, so none is applied (the formula's discount term is 0).
- **Data**: rows live in `invoice_items` (`invoice_id`, `position`, `product_service`, `quantity`, `unit_cost_centavos`, `amount_centavos`). The pricing columns are added automatically to an existing table on the first request (and by `migrations/004_invoice_item_pricing.sql`); nothing existing is altered or rewritten. `invoices.product_service` stays the item names joined with ", " so search, the product filter, sorting and the dashboard keep working, and `invoices.amount_centavos` is the sum of the item amounts.
- **API**: invoices accept and return `items: [{ product_service, quantity, unit_cost, amount }]` (pesos). A request with only `product_service` + `amount` still works and is read as one item, quantity 1, with that amount as its unit cost. Validation errors come back as `items_<row>_product_service` / `items_<row>_unit_cost` / `items_<row>_quantity`.
- **Older invoices**: an invoice with no item rows is read as one item, quantity 1, unit cost = its stored amount. Items saved before unit costs existed return `unit_cost: null`; the invoice keeps its stored amount until it is edited. Editing such an invoice asks for a unit cost per item (a single item is pre-filled only when the stored amount divides exactly) and recalculates the amount from them.
- **Preview**: one row per item (QTY, description, unit cost, amount), then the existing totals block: Total Sales (VAT Inclusive) is the subtotal and equals the saved Invoice Amount; the VAT, withholding tax and Total Amount Due rows keep their earlier meaning. Older invoices without unit costs show their stored amount (a derived unit cost for one item, the total only for several).
- **Limits**: the dashboard "Top products & services" chart and its exact-match product filter work on the joined text, so an invoice with several items appears as one combined entry there.
- The invoices list shows items as "Cement x 10, IT Services x 2", and shows - for empty CR No., Delivery Date, Remarks and Due Date.

## Invoice numbers (SVI / SI)
The form has a prefix selector (**SVI** or **SI**) and a number box. Saved numbers always look like `SVI - 001`, `SVI - 2026-001`, `SI - 001`, `SI - 2026-001` (prefix, space, hyphen, space, number; `shared/invoiceNumber.js`, applied by the API so every client gets it). Whitespace is trimmed, a repeated prefix is dropped (`SI - SI - 001` becomes `SI - 001`), and a typed prefix that contradicts the selected one is rejected. The form shows "Saved as ..." as you type, and the preview prints only that number.
- **Existing numbers are never renumbered.** Older numbers (`SVI00123`, `VI00123`, `INV-9`) stay as stored; editing an invoice and leaving its number alone keeps it exactly. If you change the number, the standard format applies (so an old `VI` number must be changed to SVI or SI).

## Dashboard filters (Settings > Dashboard filters)
Settings has two clearly separate panels (side by side on wide screens): **Invoice form** (product/service options and invoice fields) and **Dashboard filters**. The second one chooses which fields appear as filters above the dashboard and in what order.
- **Available filters**: Client, Product/Service, Payment status, Delivery status, and every active custom invoice field. Defaults match the old dashboard: only Client and Product/Service are on. **Date range** is always shown (it sets the period for every chart) and is not configurable. At most 8 filters can be on.
- **Controls on the dashboard**: dropdown fields and checkboxes are selects, date and number fields use matching inputs, text fields are "contains" boxes (applied after a short pause in typing). The KPI cards, charts, "View invoices" links and the page subtitle all use the active filters.
- **Data**: one JSON value in `schema_meta` (key `dashboard_filters`); no new table and no invoice data is touched. Archiving a custom field removes it from the list; restoring it brings back its on/off setting. New fields start switched off.
- **API**: `GET /api/dashboard-filters` returns every available filter with its control type, options and `enabled` flag; `PUT /api/dashboard-filters` takes `{ filters: [{ key, enabled }] }` in the desired order. Dashboard endpoints accept `paymentStatus`, `deliveryStatus` and `cf_<id>` query parameters.
- **Rules kept**: cancelled invoices stay excluded from dashboard figures, so Payment status offers Unpaid, Pending, Partially Paid and Paid. The dashboard product filter is still an exact match, and now also matches invoices that list that product among several items.
- **Long lists**: clients, product options, invoice fields, dashboard filters and dropdown options show the first few entries with a "See More…" toggle ("Expand Options" in the field editor).

## Dashboard: invoices at a glance (number-light collections view)
The dashboard order is: filters, the five counts, then **Every invoice at a glance** beside **Unpaid invoices by due date**, then **Who to follow up with** beside **Where each month's invoices stand today**, then Recent invoices. They use counts, colours and plain words; peso amounts stay hidden until asked for.
- **Every invoice at a glance**: one square per invoice issued in the selected period, most urgent first. Colours: Late over 60 days, Late 31-60, Late 1-30, No due date, Waiting (not due yet; due today still counts as waiting) and Paid. Hover or focus a square for a plain-words line, click it to open that invoice in the Invoices list, and use the legend chips to highlight one status. Arrow keys move between squares. Up to 400 squares are drawn (late ones first); a note offers the full list when a period has more.
- **Who to follow up with**: clients that have late invoices, longest wait first; the bar is days late. Click a client for its late invoices. **Show amounts** reveals how much is still owed (off by default, remembered in the browser, also adds amounts to the hover line).
- **Where each month's invoices stand today**: the last six issue months ending with the period's end month, as a 100% stacked bar of the same six statuses. Click a month (or its button) to open that month's invoices. It follows the client/product/custom filters but not the start date.
- **Data**: no schema change. `GET /api/dashboard/invoice-overview` (accepts the same filters as the other dashboard endpoints, plus an optional `asOf=YYYY-MM-DD`) returns `counts`, `invoices` (with `state` and `days_late`) and `months`. A state comes from `payment_status`, amounts and `due_date`: Pending/Partially Paid with a balance is unpaid; unpaid with no due date is "No due date"; due before today is late. Cancelled invoices are excluded, as everywhere else on the dashboard. The Overdue card and these squares use the same rule.
- **Limit**: payment dates are not stored, so the app cannot say whether an invoice was paid on time. The monthly card shows today's status of each month's invoices instead; recent months look less complete because their invoices are not due yet.

## Business rules (unchanged)
Money is integer centavos; status / amount-paid rules are enforced server-side; delivery status is derived from Delivery Date; invoice numbers are trimmed and unique case-insensitively (SQLite NOCASE folds ASCII only); the dashboard excludes Cancelled except the status distribution and recent list; dates use Asia/Manila. Dashboard client/product filters are exact match; invoice-list filters are "contains". Dashboard analytics calculate outstanding balances from amount minus amount paid, classify invoices by the optional Due Date, and show a No due date category. Collected Revenue is grouped by invoice issue month because the schema does not store payment dates; this limitation is shown in the dashboard.

## UI changes that touch behaviour
- The old "Invoice pulse" card was removed from the dashboard: it bucketed unpaid invoices by *issue* date, which conflicted with the due-date based Outstanding Receivables chart. The `/api/dashboard/invoice-status` endpoint is unchanged.
- Dashboard KPI cards for Outstanding Balance and Pending Payments now open the unpaid invoice list; the invoice list's Payment filter gained an "Unpaid" option so that link shows the right value.
- Fixed: collapse/expand of client groups in the analytics dialog, and numeric sorting by amount in that dialog.
- "Add Invoice" in the sidebar/top bar opens the form via `/invoices?new=1`.
- Invoice rows show a derived "Overdue" tag (unpaid, due date before today, Asia/Manila). It is a display hint, separate from the stored payment status.

## Dashboard KPIs (counts first)
The top cards answer "how many", as of today: Total Invoices (excluding cancelled), Pending Payments (Pending + Partially Paid with a balance), Overdue (unpaid and past the Due Date; invoices with no due date are not overdue), Delivered and Pending Deliveries. They ignore the date-range filter (client/product filters still apply). Peso amounts appear only in the hover card; clicking opens the matching invoices (Pending/Overdue in a searchable dialog grouped by client). The "Unpaid invoices by due date" doughnut follows the same rule. The dashboard no longer shows the Collected revenue, Invoice value over time, Payment status, Top clients and Top products & services charts; their API endpoints (`/api/dashboard/invoice-trends`, `payment-distribution`, `top-clients`, `top-products`, and the revenue part of `analytics`) are unchanged and the page simply no longer requests the first four.

## Invoice preview
An eye button in the Add/Edit Invoice form (and "Preview invoice" in each row's action menu) opens a print-ready Quandatics service invoice (A5) built from the form values, before anything is saved. Each item prints as its own row (quantity, unit cost, amount) and Total Sales is the invoice amount (the item subtotal) treated as VAT-inclusive; the Sale type (VATable 12% / VAT-Exempt / Zero Rated) and Withholding tax selectors only affect the preview and are not stored. The client's Address and TIN print from the details saved with the invoice (see Clients); P.O. No. is not part of the data model, so it prints blank. A long address wraps over the two left-hand cells of its rows, so the sheet stays one A5 page. Print uses the browser dialog and produces a single A5 page (`client/src/components/invoices/InvoicePreview.jsx`, `invoice-sheet.css`).

## Not implemented (also absent from the original source)
Settings page and runtime Turso switching, demo login, CSV export, Top Products value/count toggle, Delivery Overview chart, row-click details on the recent list.

## Intentional differences from the original
- Express removed. The API is a plain function (`server/handler.js`) behind one Vercel function; the same code runs inside the Vite dev server.
- Schema runs in one batched round trip; a failed init is retried on the next request.
- Hardening: non-numeric ids give 404 (was 500); `sortBy`/dashboard names are checked with `Object.hasOwn`; malformed JSON gives a JSON 400.
- UI split into components; added labels, `aria` attributes, dialog semantics with Escape-to-close. Layout and behavior are otherwise the same.
