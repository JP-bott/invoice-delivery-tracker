# Dashboard Period Intelligence — Changelog

## Files changed
- `client/src/pages/Dashboard.jsx`: Replaced the old filter stack and one-size-fits-all charts with three dedicated responsive views. Retains existing Recharts, cards, tokens, and dark mode. URL `?range=month|quarter|year` retains selection on refresh.
- `shared/dashboardReport.js` (new): Shared date boundaries, Manila reporting day, centavo-safe aggregation, ties, rankings and classifications.
- `server/services/dashboardService.js`: Added `period-report` endpoint using parameterized, bounded SQL.
- `client/src/utils/constants.js`: Removed obsolete dashboard preset options.
- `server/tests/dashboard-period-report.test.js`: Date, classification, comparison and ranking coverage.

## API
`GET /api/dashboard/period-report?range=month|quarter|year` (defaults to month).

Response: `{ period, kpis, highlights, monthly, clients, productsByQuantity, productsBySales, missingItemPrices, month, quarter }`.

No database migration. Existing API endpoints and legacy dashboard endpoints remain intact for other integrations.

## Definitions
- **Reporting date:** invoice `date_issued` in Asia/Manila calendar boundaries.
- **Sales / billed:** saved `invoices.amount_centavos` (VAT-inclusive), excluding Cancelled and deleted invoices.
- **Collected:** current saved `amount_paid_centavos` for invoices in the selected issued-date period. This is **not cash received on a particular day**, because the current schema does not store payment timestamps.
- **Collection rate:** collected ÷ VAT-inclusive billed, with zero denominator shown as 0%.
- **Monthly sales:** billed totals grouped by issue month, including zero-sale months. Highest ties displayed; lowest excludes future months but includes elapsed zero-sale months.
- **Clients:** billed total grouped by saved client name, with ties for top and lowest.
- **Products:** quantity summed from invoice_items; sales amount from recorded line-item amounts (legacy single-line fallback only). Legacy multi-item records with missing price have their unallocated amounts omitted from product sales, *not* from total invoice sales.
- **Upcoming:** outstanding payment with due date on or after today.
- **Past due:** outstanding payment with due date before today; aging 1–7, 8–15, 16–30 and 31+ days.
- **Paid and delivered (month):** invoice currently Paid (or paid in full) and delivery_date within the selected issue-month period. **This is not evidence that payment occurred this month.**
- **Other:** no due date, or fully paid but not delivered in the period. Excluded from the three-part monthly donut; included in totals and general status counts.
- **Quarterly performance:** issued-date totals for current three months vs preceding three months, even across year boundaries. No prior-quarter sales shows no percentage baseline instead of an infinite rate.
- **Quarterly delivery:** delivery_date exists vs absent on invoices issued in the selected quarter.

## Deployment and validation
1. Get code from the branch ZIP download, or check out `feature/dashboard-period-intelligence`.
2. With Node 20+, run `npm install`.
3. Run `npm test` and `npm run build`.
4. Start with `npm run dev`, open Dashboard, switch periods, and verify the same URL range after refreshing.
5. Check month drill-down, year and quarter charts, mobile layout and dark mode.
6. After review, merge the pull request and deploy the updated `main` on Vercel.

**Important:** No paid services were added. The previous dashboard-filters Settings page remains for compatibility but its configurable controls are no longer shown on the dashboard.

Full Vite/Vitest integration was not executed in this environment. Eight isolated JavaScript aggregation/boundary checks passed, but a real database/API and UI smoke test remain required.
