// Zero-dependency XLSX writer. Excel Office Open XML + ZIP (stored entries).
// Keeps invoice identifiers as text, money as numbers, and prevents formula injection.
const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const col = (n) => { let out=''; for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out; };
const money = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const textCell = (value) => ({ v: value == null ? '' : String(value), type: 's' });
const numCell = (value) => ({ v: value == null || value === '' ? null : Number(value), type: 'n' });
const safeText = (value) => textCell(value);
const dateCell = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return textCell(value || '');
  const t=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(t) ? {v: t/86400000+25569,type:'n',date:true} : textCell(value);
};
const sheet = (name, headers, rows, widths, amountCols = [], dateCols = [], statusCols=[]) => ({name,headers,rows,widths,amountCols,dateCols,statusCols});
const cellXml = (cell, ref, header=false, index=0, sheetInfo=null) => {
  const c = cell && typeof cell === 'object' && 'type' in cell ? cell : textCell(cell);
  const style=header ? 2 : c.date || sheetInfo?.dateCols.includes(index) ? 4 : sheetInfo?.amountCols.includes(index) ? 3 : sheetInfo?.statusCols.includes(index) ? 5 : 1;
  if(c.type==='n' && c.v!=null && Number.isFinite(c.v)) return `<c r="${ref}" s="${style}"><v>${c.v}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
};
const sheetXml = (s) => {
  const cols=s.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(55,Math.max(11,w))}" customWidth="1"/>`).join('');
  const row=(cells,r,header=false)=>`<row r="${r}" ht="${header?32:23}" customHeight="1">${cells.map((c,i)=>cellXml(c,col(i)+r,header,i,s)).join('')}</row>`;
  const all=[row(s.headers.map(textCell),1,true),...s.rows.map((x,i)=>row(x,i+2))].join('');
  const last=col(s.headers.length-1)+(s.rows.length+1);
  const filter=`<autoFilter ref="A1:${last}"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="23"/><cols>${cols}</cols><sheetData>${all}</sheetData>${filter}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
};
const encoder = new TextEncoder();
const crcTable = Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32 = (buf) => {let v=0xffffffff;for(const b of buf)v=crcTable[(v^b)&255]^(v>>>8);return (v^0xffffffff)>>>0;};
const le16=(v)=>[v&255,(v>>>8)&255],le32=(v)=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
// ZIP record sizes are defined by PKZIP APPNOTE. In particular, central-directory
// headers MUST be 46 bytes before the filename. An earlier implementation wrote 44
// bytes, corrupting the directory and making Excel/WPS reject the downloaded XLSX.
function zip(files) {
  if (files.length > 0xffff) throw new Error('Too many Excel package entries');
  const locals = [], central = [];
  let offset = 0;
  for (const [filename, content] of files) {
    const name = encoder.encode(filename);
    const bytes = encoder.encode(content);
    const sum = crc32(bytes);
    if (name.length > 0xffff || bytes.length > 0xffffffff) throw new Error('Excel package entry too large');

    // Local file header: 30 bytes before filename and data.
    const localHeader = new Uint8Array([
      80, 75, 3, 4, ...le16(20), ...le16(0x0800), ...le16(0),
      ...le16(0), ...le16(0), ...le32(sum),
      ...le32(bytes.length), ...le32(bytes.length),
      ...le16(name.length), ...le16(0),
    ]);

    // Central directory header: 46 bytes before filename.
    // After filename length: extra(2), comment(2), disk(2), int attrs(2),
    // external attrs(4), local header offset(4).
    const directoryHeader = new Uint8Array([
      80, 75, 1, 2, ...le16(20), ...le16(20), ...le16(0x0800),
      ...le16(0), ...le16(0), ...le16(0), ...le32(sum),
      ...le32(bytes.length), ...le32(bytes.length), ...le16(name.length),
      ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(0), ...le32(offset),
    ]);
    if (localHeader.length !== 30 || directoryHeader.length !== 46) {
      throw new Error('Invalid Excel ZIP header');
    }
    locals.push(localHeader, name, bytes);
    central.push(directoryHeader, name);
    offset += localHeader.length + name.length + bytes.length;
    if (offset > 0xffffffff) throw new Error('Excel package exceeds ZIP32 size limit');
  }

  const directorySize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  if (offset + directorySize + 22 > 0xffffffff) throw new Error('Excel package exceeds ZIP32 size limit');
  // End of central directory: fixed 22-byte record with zero-length comment.
  const endRecord = new Uint8Array([
    80, 75, 5, 6, ...le16(0), ...le16(0),
    ...le16(files.length), ...le16(files.length),
    ...le32(directorySize), ...le32(offset), ...le16(0),
  ]);
  return new Blob([...locals, ...central, endRecord], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
const styles=`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0.00;[Red](&quot;₱&quot;#,##0.00)"/><numFmt numFmtId="165" formatCode="dd mmm yyyy"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF193B5B"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183153"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><bottom style="hair"><color rgb="FFD7E2ED"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="1" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
function makeXlsx(sheets){
 const files=[];
 files.push(['[Content_Types].xml',`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
 files.push(['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
 files.push(['xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`]);
 files.push(['xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
 files.push(['xl/styles.xml',styles]);
 sheets.forEach((s,i)=>files.push([`xl/worksheets/sheet${i+1}.xml`,sheetXml(s)]));
 return zip(files);
}
function isoDate(s){return /^\d{4}-\d{2}-\d{2}/.test(s||'')?String(s).slice(0,10):'';}
export function buildInvoiceWorkbook(invoices, fields = [], generatedAt = new Date()) {
 const active=[...invoices];
 const gross=active.reduce((n,x)=>n+money(x.amount),0);
 const paid=active.reduce((n,x)=>n+money(x.amount_paid),0);
 const outstanding=active.reduce((n,x)=>n+money(x.outstanding),0);
 const headers=['Invoice No.','Issued','Client','Client TIN','Client Address','CR No.','Products / Services','Terms','Due Date','Invoice Total','Amount Paid','Outstanding','Payment Status','Delivery Date','Delivery Status','Remarks','Record ID','Created At','Updated At',...fields.map(f=>f.label+(f.archived?' (archived)':''))];
 const invoiceRows=active.map(x=>[
  safeText(x.invoice_no),dateCell(x.date_issued),safeText(x.client_name),safeText(x.client_tin),safeText(x.client_address),safeText(x.cr_no),
  safeText(x.product_service),safeText(x.terms),dateCell(x.due_date),numCell(x.amount),numCell(x.amount_paid),numCell(x.outstanding),
  safeText(x.payment_status),dateCell(x.delivery_date),safeText(x.deliveryStatus),safeText(x.remarks),numCell(x.id),safeText(x.created_at),safeText(x.updated_at),
  ...fields.map(f=>safeText(x.custom_fields?.[f.id]))
 ]);
 const itemRows=active.flatMap(x=>(x.items||[]).map((item,i)=>[
  safeText(x.invoice_no),numCell(x.id),numCell(i+1),safeText(x.client_name),safeText(item.product_service),numCell(item.quantity),
  item.unit_cost==null?textCell('Not recorded'):numCell(item.unit_cost),
  item.amount==null?textCell('Not recorded'):numCell(item.amount),safeText(x.payment_status),safeText(item.description)
 ]));
 const textRows=active.flatMap(x=>(x.text_rows||[]).map((entry,i)=>[
  safeText(x.invoice_no),numCell(x.id),numCell(i+1),safeText(x.client_name),numCell(entry.after_item),safeText(entry.text)
 ]));
 const customRows=active.flatMap(x=>fields.filter(f=>x.custom_fields?.[f.id]!=null).map(f=>[
  safeText(x.invoice_no),safeText(f.label),safeText(f.input_type),safeText(x.custom_fields[f.id]),safeText(f.archived?'Archived':'Active')
 ]));
 const timelineRows=active.flatMap(x=>(x.timeline||[]).map(e=>[
  safeText(x.invoice_no),safeText(x.client_name),safeText(e.stage_label),safeText(e.stage_tone),safeText(e.note),
  safeText(e.created_at),safeText(e.updated_at),numCell(e.id)
 ]));
 const summary=sheet('Overview',['Metric','Value','Explanation'],[
 ['Report generated',generatedAt.toISOString(),'Export timestamp in UTC'],
 ['Included records',numCell(active.length),'All invoices, including cancelled'],
 ['Gross invoice value',numCell(gross),'Sum of saved invoice amounts, PHP'],
 ['Payments recorded',numCell(paid),'Sum of saved paid amounts, PHP'],
 ['Outstanding balance',numCell(outstanding),'Sum of saved outstanding balances, PHP'],
 ['Invoice line items',numCell(itemRows.length),'Detailed in Line Items sheet'],
 ['Supporting text rows',numCell(textRows.length),'Detailed in Supporting Text sheet'],
 ['Custom field values',numCell(customRows.length),'Includes archived custom field values'],
 ['Payment timeline updates',numCell(timelineRows.length),'Detailed in Payment History sheet'],
 ['Data scope','All records','No page limit and no active screen filters'],
 ['Source','Invoice & Delivery Tracker','Saved database values at export time']
 ],[30,28,58],[1]);
 const register=sheet('Invoice Register',headers,invoiceRows,[19,17,27,19,42,17,40,13,17,20,20,20,19,17,19,46,13,27,27,...fields.map(()=>23)],[9,10,11],[1,8,13],[12,14]);
 const items=sheet('Line Items',['Invoice No.','Record ID','Line #','Client','Product / Service','Quantity','Unit Cost (PHP)','Line Amount (PHP)','Payment Status','Product Description'],itemRows,[20,13,12,27,38,14,20,22,21,48],[6,7],[],[8]);
 const textSheet=sheet('Supporting Text',['Invoice No.','Record ID','Text Row #','Client','After Product #','Nature of Service Text'],textRows,[20,13,13,28,18,78]);
 const customs=sheet('Custom Fields',['Invoice No.','Field','Field Type','Saved Value','Field Availability'],customRows,[20,30,19,48,24]);
 const history=sheet('Payment History',['Invoice No.','Client','Stage','Tone','Progress Note','Created At (UTC)','Updated At (UTC)','Event ID'],timelineRows,[20,27,31,18,65,28,28,14]);
 return makeXlsx([summary,register,items,textSheet,customs,history]);
}
export { makeXlsx };
