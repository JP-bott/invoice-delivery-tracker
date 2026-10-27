// Shared, pure reporting rules for Asia/Manila. Dashboard API supplies a Manila
// calendar date from client/src/utils/dates.js, so frontend and backend use the same boundaries.
// SALES = saved VAT-INCLUSIVE invoice amount_centavos, not payments received.
// Cancelled invoices are excluded from sales, collections and all status metrics.

const pad = n => String(n).padStart(2,'0');
const monthEnd = (year,month) => new Date(Date.UTC(year,month,0)).getUTCDate();
const dateAt = (year,month,day) => `${year}-${pad(month)}-${pad(day)}`;
const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const cent = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const pesos = cents => Math.round(cents) / 100;
const record = r => ({
  id: Number(r.id), invoice_no: r.invoice_no, client_name: r.client_name,
  product_service: r.product_service, date_issued: r.date_issued,
  due_date: r.due_date || null, delivery_date: r.delivery_date || null,
  payment_status: r.payment_status, amount: pesos(cent(r.amount_centavos)),
  amount_paid: pesos(cent(r.amount_paid_centavos)),
  outstanding: pesos(Math.max(0,cent(r.amount_centavos)-cent(r.amount_paid_centavos))),
});
export function dashboardBounds(range, today) {
  if(!['month','quarter','year'].includes(range)) throw new Error('Invalid dashboard range');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today)))throw new Error('Invalid reporting date');
  const [year,month,day] = today.split('-').map(Number);
  if (month<1||month>12||day<1||day>monthEnd(year,month))throw new Error('Invalid reporting date');
  const quarter = Math.floor((month-1)/3)+1;
  const start = range==='month'?month:range==='quarter'?(quarter-1)*3+1:1;
  const end = range==='month'?month:range==='quarter'?start+2:12;
  const months = Array.from({length:end-start+1},(_,index)=>{
    const m=start+index;
    return {key:`${year}-${pad(m)}`,label:M[m-1],dateFrom:dateAt(year,m,1),
      dateTo:dateAt(year,m,monthEnd(year,m)),value:0,collected:0,count:0};
  });
  const from=dateAt(year,start,1),to=dateAt(year,end,monthEnd(year,end));
  const previousQuarterStart = quarter===1?dateAt(year-1,10,1):dateAt(year,(quarter-2)*3+1,1);
  const previousQuarterEnd = quarter===1?dateAt(year-1,12,31):dateAt(year,(quarter-1)*3,monthEnd(year,(quarter-1)*3));
  return {range,year,quarter,today,from,to,months,
    previousQuarter:{from:previousQuarterStart,to:previousQuarterEnd},
    label:range==='month'?'This Month':range==='quarter'?`This Quarter – Q${quarter}`:'This Year'};
}
export const elapsedDays = (from,to) => Math.max(0,Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000));
export function classifyInvoice(row,today,rangeFrom,rangeTo) {
  if (row.payment_status === 'Cancelled') return 'excluded';
  const gross=cent(row.amount_centavos),received=cent(row.amount_paid_centavos);
  const paid=row.payment_status==='Paid'||(gross>0&&received>=gross);
  if(paid) {
    // Paid This Month is a CURRENT state, not a payment-date claim (no payment timestamp exists).
    return row.delivery_date && row.delivery_date>=rangeFrom && row.delivery_date<=rangeTo ? 'paid' : 'other';
  }
  if(!row.due_date)return 'other';
  return row.due_date<today?'overdue':'upcoming';
}
const rank = (entries,field='amount_centavos') =>
  [...entries].sort((a,b)=>b[field]-a[field]||String(a.name).localeCompare(String(b.name)));
const ties = (entries,metric,direction) => {
  if(!entries.length)return [];
  const values=entries.map(x=>x[metric]);
  const target=direction==='high'?Math.max(...values):Math.min(...values);
  return entries.filter(x=>x[metric]===target);
};
const asMoney = rows => rows.map(({amount_centavos,paid_centavos,...r})=>({
  ...r,value:pesos(amount_centavos||0),collected:pesos(paid_centavos||0),
}));
function groupByName(rows,keySelector,amountSelector,quantitySelector=()=>0) {
  const lookup=new Map();
  for(const row of rows) {
    const name=String(keySelector(row)||'Unspecified').trim()||'Unspecified';
    const current=lookup.get(name)||{name,amount_centavos:0,quantity:0,count:0};
    current.amount_centavos+=cent(amountSelector(row));
    current.quantity+=cent(quantitySelector(row));
    current.count++;
    lookup.set(name,current);
  }
  return [...lookup.values()];
}
export function aggregateDashboard(rows=[],itemRows=[],bounds,previousQuarterCentavos=0) {
  const records=rows.filter(row=>row.payment_status!=='Cancelled'&&row.date_issued>=bounds.from&&row.date_issued<=bounds.to);
  const byMonth=new Map(bounds.months.map(m=>[m.key,{...m,amount_centavos:0,paid_centavos:0}]));
  let billed=0,collected=0;
  for(const r of records) {
    const amount=cent(r.amount_centavos),paid=cent(r.amount_paid_centavos);
    billed+=amount;collected+=paid;
    const m=byMonth.get(String(r.date_issued).slice(0,7));
    if(m){m.amount_centavos+=amount;m.paid_centavos+=paid;m.count++;}
  }
  const monthly=[...byMonth.values()].map(({amount_centavos,paid_centavos,...m})=>({
    ...m,value:pesos(amount_centavos),collected:pesos(paid_centavos),
    amount_centavos,paid_centavos,
  }));
  const completed=monthly.filter(m=>m.key<=bounds.today.slice(0,7));
  const bestMonths=ties(completed,'amount_centavos','high');
  // Missing months count as zero once the calendar month has started, never in future.
  const lowestMonths=ties(completed,'amount_centavos','low');
  const clients=rank(groupByName(records,r=>r.client_name,r=>r.amount_centavos));
  const topClients=ties(clients,'amount_centavos','high');
  const lowestClients=ties(clients,'amount_centavos','low');

  const itemsById=new Map();
  for(const item of itemRows) {
    const id=Number(item.invoice_id);
    const list=itemsById.get(id)||[];
    list.push(item);itemsById.set(id,list);
  }
  const salesItems=[];
  let unpricedLineItems=0;
  for(const inv of records) {
    const lineItems=itemsById.get(Number(inv.id))||[];
    // Legacy invoice: no line-item detail, so its summary is one availed unit.
    if(!lineItems.length) {
      salesItems.push({name:inv.product_service,amount_centavos:cent(inv.amount_centavos),quantity:1});continue;
    }
    for(const item of lineItems) {
      // Old individual items may not have recorded line prices. Never invent a
      // monetary allocation for multi-item invoices; retain their quantity.
      let amount = item.amount_centavos;
      if(amount == null && lineItems.length===1)amount=inv.amount_centavos;
      if(amount==null)unpricedLineItems++;
      salesItems.push({name:item.product_service,amount_centavos:cent(amount),quantity:cent(item.quantity)});
    }
  }
  const products=groupByName(salesItems,x=>x.name,x=>x.amount_centavos,x=>x.quantity);
  const rankedQuantity=rank(products,'quantity'),rankedRevenue=rank(products,'amount_centavos');
  const most=ties(products,'quantity','high'),least=ties(products,'quantity','low');
  const counts={paid:0,upcoming:0,overdue:0,other:0};
  const lists={paid:[],upcoming:[],overdue:[],other:[]};
  const amounts={paid:0,upcoming:0,overdue:0,other:0};
  const aging=[{label:'1–7 days',count:0,amount:0},{label:'8–15 days',count:0,amount:0},
    {label:'16–30 days',count:0,amount:0},{label:'31+ days',count:0,amount:0}];
  for(const r of records) {
    const classification=classifyInvoice(r,bounds.today,bounds.from,bounds.to);
    const pending=Math.max(0,cent(r.amount_centavos)-cent(r.amount_paid_centavos));
    counts[classification]++;
    // Unpaid categories show outstanding amounts; paid means received payments.
    amounts[classification]+=classification==='paid'?cent(r.amount_paid_centavos):pending;
    lists[classification].push(record(r));
    if(classification==='overdue') {
      const late=elapsedDays(r.due_date,bounds.today);
      const bucket=late<=7?0:late<=15?1:late<=30?2:3;
      aging[bucket].count++;aging[bucket].amount+=pending;
    }
  }
  lists.upcoming.sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.id-b.id);
  lists.overdue.sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.id-b.id);
  lists.paid.sort((a,b)=>String(b.delivery_date).localeCompare(String(a.delivery_date))||b.id-a.id);
  const quarterPaid=records.filter(r=>r.payment_status==='Paid'||(cent(r.amount_centavos)>0&&cent(r.amount_paid_centavos)>=cent(r.amount_centavos))).length;
  const quarterOverdue=records.filter(r=>classifyInvoice(r,bounds.today,bounds.from,bounds.to)==='overdue').length;
  const quarterUnpaid=records.length-quarterPaid-quarterOverdue;
  const delivered=records.filter(r=>Boolean(r.delivery_date)).length;
  const change=bounds.range==='quarter'?(previousQuarterCentavos===0?
    null:(billed-previousQuarterCentavos)/previousQuarterCentavos*100):null;
  return {
    range:bounds.range,period:{from:bounds.from,to:bounds.to,asOf:bounds.today,year:bounds.year,quarter:bounds.quarter,label:bounds.label},
    kpis:{invoiceCount:records.length,totalSales:pesos(billed),collected:pesos(collected),
      outstanding:pesos(Math.max(0,billed-collected)),collectionRate:billed?Math.min(100,collected/billed*100):0,
      previousQuarter:pesos(previousQuarterCentavos),quarterChangePercent:change},
    highlights:{bestMonths:asMoney(bestMonths),lowestMonths:asMoney(lowestMonths),
      topClients:asMoney(topClients),lowestClients:asMoney(lowestClients),
      mostAvailed:asMoney(most),leastAvailed:asMoney(least)},
    monthly:monthly.map(({amount_centavos,paid_centavos,...m})=>m),
    clients:asMoney(clients).slice(0,10),
    productsByQuantity:asMoney(rankedQuantity).slice(0,10),
    productsBySales:asMoney(rankedRevenue).slice(0,10),
    missingItemPrices:unpricedLineItems,
    month:{counts,amounts:Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,pesos(v)])),
      lists,aging:aging.map(x=>({...x,amount:pesos(x.amount)}))},
    quarter:{status:{paid:quarterPaid,unpaid:quarterUnpaid,overdue:quarterOverdue},
      delivery:{delivered,pending:records.length-delivered}},
  };
}
