import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dashboardBounds, aggregateDashboard, classifyInvoice } from '../../shared/dashboardReport.js';
const inv=(id,date_issued,amount_centavos,overrides={})=>({
  id, date_issued, amount_centavos, amount_paid_centavos:0,
  client_name:'Acme',product_service:'Service',due_date:'2026-10-20',
  delivery_date:null,payment_status:'Pending',invoice_no:`SI-${id}`,...overrides,
});
describe('Manila period boundaries',()=>{
 it('handles month ends and leap years',()=>{
  expect(dashboardBounds('month','2024-02-29')).toMatchObject({from:'2024-02-01',to:'2024-02-29'});
  expect(dashboardBounds('month','2026-12-31')).toMatchObject({from:'2026-12-01',to:'2026-12-31'});
 });
 it('switches quarter correctly on boundaries and rolls to previous year',()=>{
  expect(dashboardBounds('quarter','2026-04-01')).toMatchObject({from:'2026-04-01',to:'2026-06-30',quarter:2});
  expect(dashboardBounds('quarter','2026-01-01')).toMatchObject({quarter:1,previousQuarter:{from:'2025-10-01',to:'2025-12-31'}});
  expect(dashboardBounds('quarter','2026-10-27').label).toBe('This Quarter – Q4');
 });
 it('covers full year and excludes non-actual invalid dates',()=>{
  expect(dashboardBounds('year','2026-10-27')).toMatchObject({from:'2026-01-01',to:'2026-12-31'});
  expect(()=>dashboardBounds('year','2026-02-30')).toThrow();
 });
});
describe('dashboard aggregation',()=>{
 const bounds=dashboardBounds('year','2026-10-27');
 it('excludes cancelled invoices and preserves tied extremes, including elapsed zero months',()=>{
  const report=aggregateDashboard([
    inv(1,'2026-01-05',10000,{client_name:'A'}),
    inv(2,'2026-01-06',10000,{client_name:'B'}),
    inv(3,'2026-02-06',10000,{client_name:'B'}),
    inv(4,'2026-04-01',900000,{payment_status:'Cancelled'}),
  ],[],bounds);
  expect(report.kpis.totalSales).toBe(300);
  expect(report.highlights.bestMonths.map(x=>x.label)).toEqual(['Jan']);
  expect(report.highlights.lowestMonths.map(x=>x.label)).toContain('Mar');
  expect(report.highlights.lowestMonths.map(x=>x.label)).not.toContain('Nov');
  expect(report.highlights.topClients.map(x=>x.name)).toEqual(['B']);
  expect(report.highlights.lowestClients.map(x=>x.name)).toEqual(['A']);
 });
 it('handles unpaid overdue upcoming paid delivered and missing due dates',()=>{
  const month=dashboardBounds('month','2026-10-27');
  const rows=[
    inv(1,'2026-10-02',10000,{due_date:'2026-10-26'}),
    inv(2,'2026-10-03',10000,{due_date:'2026-10-27'}),
    inv(3,'2026-10-04',10000,{payment_status:'Paid',amount_paid_centavos:10000,delivery_date:'2026-10-13'}),
    inv(4,'2026-10-05',10000,{payment_status:'Paid',amount_paid_centavos:10000,delivery_date:null}),
    inv(5,'2026-10-06',10000,{due_date:null}),
  ];
  const r=aggregateDashboard(rows,[],month);
  expect(r.month.counts).toEqual({paid:1,upcoming:1,overdue:1,other:2});
  expect(r.month.aging[0].count).toBe(1);
  expect(r.kpis.collectionRate).toBe(40);
  expect(classifyInvoice(rows[3],month.today,month.from,month.to)).toBe('other');
 });
 it('ranks product quantity and sales separately without double counting a multi-item invoice',()=>{
  const r=aggregateDashboard([inv(1,'2026-10-02',30000)],
    [{invoice_id:1,product_service:'A',quantity:4,amount_centavos:10000},
      {invoice_id:1,product_service:'B',quantity:1,amount_centavos:20000}],
    dashboardBounds('month','2026-10-27'));
  expect(r.kpis.totalSales).toBe(300);
  expect(r.productsByQuantity[0].name).toBe('A');
  expect(r.productsBySales[0].name).toBe('B');
 });
 it('uses null for change without a prior-quarter baseline',()=>{
  const r=aggregateDashboard([inv(1,'2026-10-10',10000)],[],dashboardBounds('quarter','2026-10-27'));
  expect(r.kpis.quarterChangePercent).toBeNull();
 });
});

describe('dashboard period filter regression',()=>{
  it('shows only month, quarter and year options',()=>{
    const page=readFileSync(new URL('../../client/src/pages/Dashboard.jsx',import.meta.url),'utf8');
    const constants=readFileSync(new URL('../../client/src/utils/constants.js',import.meta.url),'utf8');
    expect(page).toContain("const VALID=['month','quarter','year']");
    expect(page).toContain('aria-label="Date range"');
    expect(page).toContain('filterDefs.filter(f=>f.enabled)');
    expect(page).toContain('range:selected,...active');
    expect(page).not.toContain('Custom Range');
    expect(page).not.toContain('Last 7 Days');
    expect(page).not.toContain('All Time');
    expect(page).not.toContain('<FilterControl');
    expect(constants).not.toContain('PRESETS');
  });
});
