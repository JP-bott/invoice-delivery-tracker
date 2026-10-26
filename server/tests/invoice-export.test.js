import { describe, expect, it } from 'vitest';
import { buildInvoiceWorkbook } from '../../client/src/utils/invoiceWorkbook.js';
import { handle } from '../handler.js';
import { resetDb } from '../database/db.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const invoke = (method, route, body) => {
 const url = new URL(route,'http://localhost');
 return handle({method,path:url.pathname,query:Object.fromEntries(url.searchParams),body});
};
const draft = (i) => ({
 date_issued:'2026-10-10',invoice_prefix:'SI',client_name:'Client '+i,
 items:[{product_service:'Service',unit_cost:100+i,quantity:2}],
 payment_status:'Pending',amount_paid:0,
});
describe('complete invoice Excel export', () => {
 it('builds a real XLSX ZIP with all report sheets and safely preserves text', async () => {
  const invoice={id:1,invoice_no:'SI - 0001',date_issued:'2026-10-10',client_name:'=SUM(1,1)',amount:1200,amount_paid:200,outstanding:1000,payment_status:'Pending',items:[{product_service:'Service',quantity:2,unit_cost:600,amount:1200}],timeline:[{id:4,stage_label:'Under review',stage_tone:'info',note:'Check required',created_at:'2026-10-10T10:00:00Z',updated_at:'2026-10-10T10:00:00Z'}],custom_fields:{'12':'ABC'}};
  const file=buildInvoiceWorkbook([invoice],[{id:12,label:'PO Number',input_type:'text'}]);
  const bytes=new Uint8Array(await file.arrayBuffer());
  expect([...bytes.slice(0,4)]).toEqual([80,75,3,4]);
  // Validate the actual ZIP central directory, not just the PK prefix.
  // The previous implementation produced 44-byte directory headers and unreadable XLSX files.
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const signature=(offset)=>view.getUint32(offset,true);
  const eocd=bytes.length-22;
  expect(signature(eocd)).toBe(0x06054b50);
  const count=view.getUint16(eocd+10,true);
  const centralSize=view.getUint32(eocd+12,true);
  let cursor=view.getUint32(eocd+16,true);
  const start=cursor, filenames=[];
  for(let i=0;i<count;i++){
    expect(signature(cursor)).toBe(0x02014b50);
    const nameLen=view.getUint16(cursor+28,true);
    const extraLen=view.getUint16(cursor+30,true);
    const commentLen=view.getUint16(cursor+32,true);
    const localOffset=view.getUint32(cursor+42,true);
    expect(signature(localOffset)).toBe(0x04034b50);
    const filename=new TextDecoder().decode(bytes.slice(cursor+46,cursor+46+nameLen));
    filenames.push(filename);
    cursor+=46+nameLen+extraLen+commentLen;
  }
  expect(cursor-start).toBe(centralSize);
  expect(filenames).toContain('[Content_Types].xml');
  expect(filenames).toContain('xl/workbook.xml');
  expect(filenames).toContain('xl/worksheets/sheet5.xml');
  const decoded=new TextDecoder().decode(bytes);
  expect(decoded).toContain('Invoice Register');
  expect(decoded).toContain('Payment History');
  expect(decoded).toContain('PO Number');
  expect(decoded).toContain('SI - 0001');
  expect(decoded).toContain('=SUM(1,1)');
  expect(decoded).toContain('Check required');
 });
 it('exports every invoice in ascending ID batches, even beyond the 100 row UI limit', async () => {
  process.env.TURSO_DATABASE_URL='file:'+path.join(fs.mkdtempSync(path.join(os.tmpdir(),'idt-export-')),'db.sqlite');
  resetDb();
  for(let i=0;i<107;i++) {
   const r=await invoke('POST','/api/invoices',draft(i));
   expect(r.status).toBe(201);
  }
  const zero=await invoke('GET','/api/invoices/export-data?afterId=0');
  expect(zero.status).toBe(200);
  expect(zero.body.total).toBe(107);
  const a=await invoke('GET','/api/invoices/export-data');
  expect(a.status).toBe(200);
  expect(a.body.data).toHaveLength(100);
  expect(a.body.total).toBe(107);
  expect(a.body.has_more).toBe(true);
  const b=await invoke('GET',`/api/invoices/export-data?maxId=${a.body.max_id}&afterId=${a.body.next_after_id}`);
  expect(b.status).toBe(200);
  expect(b.body.data).toHaveLength(7);
  expect(b.body.has_more).toBe(false);
  expect(new Set([...a.body.data,...b.body.data].map(x=>x.id)).size).toBe(107);
  expect((await invoke('GET','/api/invoices/export-data?afterId=invalid')).status).toBe(400);
  expect((await invoke('GET','/api/invoices/export-data?afterId=-1')).status).toBe(400);
  expect((await invoke('GET','/api/invoices/export-data?afterId=1.2')).status).toBe(400);
 });
});
