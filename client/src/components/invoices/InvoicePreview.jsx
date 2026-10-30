import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import Modal from '../Modal.jsx';
import { computeTotals } from '../../../../shared/pricing.js';
import { money, sheetPricing } from '../../utils/sheetPricing.js';
import { sheetInvoiceNo, invoiceDocumentTitle } from '../../utils/invoiceNo.js';
import './invoice-sheet.css';

const ROWS = 14; // fits one A5 page once the sheet is rendered with real text
const SHEET_PX = 559; // 148mm at 96dpi
const show = (c, always) => (c === 0 && !always ? '' : money(c));
const longDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '');

export { computeTotals };

export function InvoiceSheet({ invoice, type, whtRate }) {
  const { rows, total } = sheetPricing(invoice);
  const t = computeTotals(total, type, whtRate);
  const vatable = type === 'vatable';
  const invoiceNo = invoice.invoice_no || ''; // stored value ("SI - 0006"); the sheet shows only "No. 0006"
  const documentTitle = invoiceDocumentTitle(invoice);
  const isSalesInvoice = documentTitle === 'Sales Invoice';
  if (invoice.remarks) rows.push({ q: '', d: invoice.remarks, u: '', a: '', sub: true });
  while (rows.length < ROWS) rows.push({ q: '', d: '', u: '', a: '' });
  return (
    <div className="inv-sheet" role="document" aria-label={`${documentTitle} ${invoiceNo}`}>
      <header>
        <h1>QUANDATICS INC.</h1>
        <p>8th Floor Unit-O Cyber One Building 11 Eastwood Avenue, Eastwood City Cyberpark</p>
        <p>Bagumbayan 1110, Quezon City NCR, Second District Philippines</p>
        <p>VAT Reg. No. 010-241-281-00000</p>
      </header>
      <div className="title-row">
        <div className="t">{isSalesInvoice ? 'SALES' : 'SERVICE'} <b>INVOICE</b></div>
        <div className="no"><span>{sheetInvoiceNo(invoiceNo)}</span></div>
      </div>
      <table className="info"><tbody>
        <tr><td colSpan="2"><div className="cell">Billed to: <span className="v">{invoice.client_name}</span></div></td><td className="r"><div className="cell">Date: <span className="v">{longDate(invoice.date_issued)}</span></div></td></tr>
        <tr><td colSpan="2" rowSpan="2"><div className="cell addr">Address: <span className="v">{invoice.client_address || ''}</span></div></td><td className="r"><div className="cell">Terms: <span className="v">{invoice.terms || '30-days'}</span></div></td></tr>
        <tr><td className="r"><div className="cell">P.O. No.: <span className="v" /></div></td></tr>
        <tr><td colSpan="3"><div className="cell">TIN: <span className="v">{invoice.client_tin || ''}</span></div></td></tr>
      </tbody></table>
      <table className="items">
        <thead><tr><th className="qty">QTY.</th><th>{isSalesInvoice ? 'NATURE OF GOODS' : 'NATURE OF SERVICE'}</th><th className="unit">UNIT<br />COST</th><th className="amt">AMOUNT</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td className="qty">{r.q}</td><td className={`d ${r.sub ? 'sub' : ''} ${r.note ? 'note-row' : ''}`}>{r.d}</td><td className="unit">{r.u}</td><td className="amt">{r.a}</td></tr>)}</tbody>
      </table>
      <table className="totals"><tbody>
        <tr><td className="c1" /><td className="c2" /><td className="c3 lbl">Total Sales (Vat Inclusive)</td><td className="c4 val">{show(t.total)}</td></tr>
        <tr><td className="c1" /><td className="c2" /><td className="lbl">Less: VAT</td><td className="val">{show(t.vat, t.has && vatable)}</td></tr>
        <tr><td className="c1" /><td className="c2" /><td className="lbl">Amount: Net of VAT</td><td className="val">{show(t.net)}</td></tr>
        <tr><td className="c1 lbl">VATable Sales</td><td className="c2 val">{show(t.sV, t.has && vatable)}</td><td className="lbl">Amount Due</td><td className="val">{show(t.net)}</td></tr>
        <tr><td className="c1 lbl">VAT-Exempt Sales</td><td className="c2 val">{show(t.sE, t.has && type === 'exempt')}</td><td className="lbl">Add: VAT</td><td className="val">{show(t.vat, t.has && vatable)}</td></tr>
        <tr><td className="c1 lbl">Zero Rated Sales</td><td className="c2 val">{show(t.sZ, t.has && type === 'zero')}</td><td className="lbl">Less:&nbsp; Withholding Tax</td><td className="val">{show(t.wht, t.has && whtRate > 0)}</td></tr>
        <tr><td className="c1 lbl">VAT-Amount</td><td className="c2 val">{show(t.vat, t.has && vatable)}</td><td className="lbl grand">Total Amount Due</td><td className="val grand">{show(t.grand)}</td></tr>
      </tbody></table>
      <p className="note">Note:&nbsp; Please make all checks payable to <b>QUANDATICS INC.</b></p>
      <div className="sign"><div className="box"><div className="line">By:<span className="u" /></div>Authorized Signature Over Printed Name</div></div>
    </div>
  );
}

export default function InvoicePreview({ invoice, onClose }) {
  const [type, setType] = useState('vatable');
  const [wht, setWht] = useState('0');
  const [zoom, setZoom] = useState(1);
  const wrap = useRef(null);
  const whtRate = useMemo(() => parseFloat(wht) || 0, [wht]);
  const totalOnly = sheetPricing(invoice).totalOnly;
  const documentTitle = invoiceDocumentTitle(invoice);

  // Scale the A5 sheet down on narrow screens instead of scrolling sideways.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 8) / SHEET_PX));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const print = () => {
    const style = document.createElement('style');
    style.textContent = '@page { size: 148mm 210mm; margin: 0; }';
    document.head.appendChild(style);
    document.body.classList.add('printing-doc');
    const done = () => { document.body.classList.remove('printing-doc'); style.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <Modal title={`${documentTitle} preview`} description="A print-ready view of this invoice. Nothing is saved until you add it." onClose={onClose} width="max-w-[calc(148mm+2.5rem)]" printKeep
      footer={<>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">Sale type
          <select className="input !h-8 !w-auto !text-xs" value={type} onChange={(e) => setType(e.target.value)}><option value="vatable">VATable (12%)</option><option value="exempt">VAT-Exempt</option><option value="zero">Zero Rated</option></select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">Withholding tax
          <select className="input !h-8 !w-auto !text-xs" value={wht} onChange={(e) => setWht(e.target.value)}>{[['0', 'None'], ['0.01', '1%'], ['0.02', '2%'], ['0.05', '5%'], ['0.1', '10%'], ['0.15', '15%']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <span className="mr-auto" />
        <button type="button" data-autofocus className="btn btn-primary" onClick={print}><Printer size={15} aria-hidden="true" />Print</button>
      </>}>
      <p className="text-xs text-fg-subtle" data-print-hide>Sale type and withholding tax only change this preview and are not saved with the invoice.{totalOnly && ' This invoice was saved before unit costs were recorded, so its amount is shown as the total only; edit it to enter unit costs.'}</p>
      <div ref={wrap} className="-mx-5 overflow-x-hidden rounded-lg bg-surface-3 p-3 sm:mx-0" data-print-body>
        <div style={{ zoom }} className="inv-zoom"><InvoiceSheet invoice={invoice} type={type} whtRate={whtRate} /></div>
      </div>
    </Modal>
  );
}
