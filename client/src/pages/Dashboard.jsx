import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarDays, RefreshCw } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import DashboardTooltip from '../components/dashboard/DashboardTooltip.jsx';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { api, peso, qs } from '../utils/api.js';
import { today } from '../utils/dates.js';
import { dashboardBounds } from '../../../shared/dashboardReport.js';
import ChartCard from '../components/dashboard/ChartCard.jsx';
import { EmptyState, PageHeader, Skeleton } from '../components/ui.jsx';

const VALID=['month','quarter','year'];
const tones={success:'text-success-ink bg-success-soft',danger:'text-danger-ink bg-danger-soft',brand:'text-brand-ink bg-brand-soft',warning:'text-warning-ink bg-warning-soft'};
const currency=v=>peso(v||0);
const asNumber=v=>new Intl.NumberFormat('en-PH',{maximumFractionDigits:2}).format(v||0);
const colors=['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)'];
const axis={tick:{fill:'var(--fg-muted)',fontSize:11},axisLine:false,tickLine:false};
const bars=(rows,key,highlight)=>rows.map((row,i)=><Cell key={row.name||row.label||i} fill={highlight?.(row)||colors[i%colors.length]}/>);
function Tile({title,value,subtitle,tone='brand',onClick}) {
  const Inner=<><div className="flex items-start justify-between gap-2"><span className="text-sm text-fg-muted">{title}</span><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{tone==='danger'?'Attention':tone==='success'?'Good':'Overview'}</span></div>
    <p className="num mt-3 break-all text-2xl font-semibold tracking-tight text-fg">{value}</p>
    {subtitle&&<p className="mt-1 text-xs text-fg-muted">{subtitle}</p>}</>;
  return onClick?<button type="button" onClick={onClick} className="card card-pad block w-full text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand">{Inner}</button>:
    <div className="card card-pad">{Inner}</div>;
}
const ChartBox=({title,description,children,className=''})=><section className={`card card-pad min-w-0 ${className}`}><h2 className="section-title">{title}</h2>{description&&<p className="mt-1 text-xs text-fg-muted">{description}</p>}<div className="mt-4">{children}</div></section>;
const Empty=({label='No invoices in this period'})=><EmptyState compact icon={BarChart3} title={label} description="Records will appear here when invoices are added."/>;
const List=({rows=[],onOpen,empty='No matching invoices'})=><div className="max-h-72 overflow-auto">{!rows.length?<Empty label={empty}/>:<table className="w-full min-w-[360px] text-left text-sm"><thead><tr className="border-b border-line text-xs text-fg-muted"><th className="p-2">Invoice</th><th className="p-2">Client</th><th className="p-2">Due / Delivered</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b border-line/50"><td className="p-2"><button className="font-medium text-brand-ink hover:underline" onClick={()=>onOpen(row)}>{row.invoice_no}</button></td><td className="max-w-[160px] truncate p-2">{row.client_name}</td><td className="p-2 text-xs text-fg-muted">{row.due_date||row.delivery_date||'—'}</td><td className="p-2 text-right tabular-nums">{currency(row.outstanding||row.amount_paid)}</td></tr>)}</tbody></table>}</div>;
function MoneyBars({items=[],dataKey='value',horizontal=false,max=10}) {
 const data=items.slice(0,max);
 if(!data.length)return <Empty/>;
 return <div className={horizontal?'h-[320px]':'h-[260px]'} role="img" aria-label={`Bar chart of ${dataKey}`}>
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={data} layout={horizontal?'vertical':'horizontal'} margin={{top:8,right:16,bottom:8,left:horizontal?18:0}}>
 <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal}/>
 {horizontal?<><XAxis type="number" {...axis}/><YAxis type="category" dataKey="name" width={125} {...axis}/></>:<><XAxis dataKey="label" {...axis}/><YAxis {...axis} width={54}/></>}
 <DashboardTooltip formatter={v=>dataKey==='quantity'?asNumber(v):currency(v)}/>
 <Bar dataKey={dataKey} maxBarSize={48} radius={horizontal?[0,5,5,0]:[5,5,0,0]}>{bars(data,dataKey)}</Bar>
 </BarChart></ResponsiveContainer></div>;
}
const names=xs=>xs.map(x=>x.label||x.name).join(', ')||'—';
function YearView({d,open}) {
 const months=d.monthly;const best=d.highlights.bestMonths;const low=d.highlights.lowestMonths;
 const highKeys=new Set(best.map(x=>x.key)),lowKeys=new Set(low.map(x=>x.key));
 return <div className="space-y-4">
 <div className="grid gap-3 sm:grid-cols-3">
 <Tile title="Total Sales This Year" value={currency(d.kpis.totalSales)} subtitle={`${d.kpis.invoiceCount} invoices`}/>
 <Tile title="Best month" value={names(best)} subtitle={best.length?currency(best[0].value):'—'} tone="success"/>
 <Tile title="Top client" value={names(d.highlights.topClients)} subtitle={d.highlights.topClients.length?currency(d.highlights.topClients[0].value):'—'}/>
 </div>
 <ChartBox title="Monthly Sales" description="Total sales by month, including months with zero sales">
 <div className="h-[290px]" role="img" aria-label="Monthly sales column chart">
 <ResponsiveContainer><BarChart data={months} margin={{top:15,right:12,left:8,bottom:5}}><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" {...axis}/><YAxis {...axis} width={58}/><DashboardTooltip formatter={currency}/><Bar dataKey="value" name="Sales" radius={[5,5,0,0]} maxBarSize={48}>{months.map(m=><Cell key={m.key} fill={highKeys.has(m.key)?'var(--chart-positive)':lowKeys.has(m.key)?'var(--chart-caution)':'var(--chart-1)'}/>)}</Bar></BarChart></ResponsiveContainer></div>
 <div className="mt-3 flex flex-wrap gap-3 text-xs text-fg-muted"><span className="text-success-ink">Highest: {names(best)} · {best.length?currency(best[0].value):'—'}</span><span className="text-warning-ink">Lowest: {names(low)} · {low.length?currency(low[0].value):'—'}</span></div></ChartBox>
 <div className="grid gap-4 lg:grid-cols-2">
 <ChartBox title="Top clients by sales"><MoneyBars items={d.clients} horizontal/><p className="mt-2 text-xs text-fg-muted">Top: {names(d.highlights.topClients)} · Lowest: {names(d.highlights.lowestClients)}</p></ChartBox>
 <ChartBox title="Products & services by quantity"><MoneyBars items={d.productsByQuantity} dataKey="quantity" horizontal/><p className="mt-2 text-xs text-fg-muted">Most availed: {names(d.highlights.mostAvailed)} · Least availed: {names(d.highlights.leastAvailed)}</p></ChartBox>
 </div>
 <ChartBox title="Products & services by sales value"><MoneyBars items={d.productsBySales} horizontal/>{d.missingItemPrices>0&&<p className="mt-2 text-xs text-warning-ink">{d.missingItemPrices} older line items have no saved price; those amounts cannot be allocated.</p>}</ChartBox>
 </div>;
}
function MonthView({d,open,onDetails}) {
 const m=d.month,c=m.counts,a=m.amounts;
 const donut=[{name:'Upcoming',value:c.upcoming,color:'var(--chart-1)'},{name:'Past Due',value:c.overdue,color:'var(--chart-negative)'},{name:'Paid',value:c.paid,color:'var(--chart-positive)'}];
 const go=(type)=>onDetails({
   title:type==='paid'?'Paid and delivered invoices':type==='overdue'?'Past due invoices':'Upcoming invoices',
   records:m.lists[type],
 });
 return <div className="space-y-4">
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
 <Tile title="Collection Rate" value={`${asNumber(d.kpis.collectionRate)}%`} subtitle="Recorded payments ÷ billed amount"/>
 <Tile title="Upcoming Invoices" value={asNumber(c.upcoming)} subtitle={currency(a.upcoming)+' outstanding'} onClick={()=>go('upcoming')}/>
 <Tile title="Past Due Invoices" value={asNumber(c.overdue)} subtitle={currency(a.overdue)+' outstanding'} tone="danger" onClick={()=>go('overdue')}/>
 <Tile title="Paid & Delivered" value={asNumber(c.paid)} subtitle={currency(a.paid)+' collected'} tone="success" onClick={()=>go('paid')}/>
 </div>
 <div className="grid gap-4 lg:grid-cols-2">
 <ChartBox title="Invoice status breakdown" description="Other includes undelivered paid records and invoices without a due date">
 <div className="h-[260px]" role="img" aria-label="Invoice status donut"><ResponsiveContainer><PieChart><Pie data={donut.filter(x=>x.value>0)} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} onClick={e=>go(String(e.name)==='Paid'?'paid':String(e.name)==='Past Due'?'overdue':'upcoming')}>{donut.filter(x=>x.value>0).map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><DashboardTooltip/><Legend/></PieChart></ResponsiveContainer></div>
 <div className="flex flex-wrap gap-2">{donut.map(x=><button key={x.name} type="button" onClick={()=>go(x.name==='Paid'?'paid':x.name==='Past Due'?'overdue':'upcoming')} className="btn btn-secondary btn-sm">{x.name}: {x.value}</button>)}</div></ChartBox>
 <ChartBox title="Past due aging" description="Unpaid invoices, grouped by days overdue"><MoneyBars items={m.aging.map(x=>({...x,label:x.label,value:x.count}))}/></ChartBox>
 </div>
 <div className="grid gap-4 lg:grid-cols-2">
 <ChartBox title={`Upcoming invoices · ${c.upcoming}`}><List rows={m.lists.upcoming} onOpen={x=>open({q:x.invoice_no})}/></ChartBox>
 <ChartBox title={`Past due invoices · ${c.overdue}`}><List rows={m.lists.overdue} onOpen={x=>open({q:x.invoice_no})}/></ChartBox>
 </div>
 <ChartBox title={`Paid and delivered in this month · ${c.paid}`} description="Based on current payment status and delivery date; payment dates are not stored"><List rows={m.lists.paid} onOpen={x=>open({q:x.invoice_no})}/></ChartBox>
 </div>;
}
function QuarterView({d,open}) {
 const q=d.quarter,delta=d.kpis.quarterChangePercent;
 return <div className="space-y-4">
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 <Tile title="Quarterly Sales" value={currency(d.kpis.totalSales)}/>
 <Tile title="vs Previous Quarter" value={delta==null?'No prior sales':`${delta>=0?'+':''}${asNumber(delta)}%`} subtitle={`Previous: ${currency(d.kpis.previousQuarter)}`} tone={delta!=null&&delta<0?'danger':'success'}/>
 <Tile title="Collected" value={currency(d.kpis.collected)} subtitle={`${asNumber(d.kpis.collectionRate)}% of billed`}/>
 <Tile title="Delivered" value={asNumber(q.delivery.delivered)} subtitle={`${q.delivery.pending} pending deliveries`}/>
 </div>
 <div className="grid gap-4 lg:grid-cols-2">
 <ChartBox title="Monthly sales this quarter"><div className="h-[260px]" role="img" aria-label="Three monthly sales bars with best month highlighted"><ResponsiveContainer><BarChart data={d.monthly}><CartesianGrid stroke="var(--chart-grid)" vertical={false}/><XAxis dataKey="label" {...axis}/><YAxis width={60} {...axis}/><DashboardTooltip formatter={currency}/><Bar dataKey="value" name="Sales" maxBarSize={48} radius={[5,5,0,0]}>{d.monthly.map(m=><Cell key={m.key} fill={d.highlights.bestMonths.some(best=>best.key===m.key)?'var(--chart-positive)':'var(--chart-1)'}/>)}</Bar></BarChart></ResponsiveContainer></div><p className="mt-2 text-xs text-success-ink">Best: {names(d.highlights.bestMonths)}</p></ChartBox>
 <ChartBox title="Billed vs Collected"><div className="h-[260px]" role="img" aria-label="Monthly billed and collected comparison"><ResponsiveContainer><BarChart data={d.monthly}><CartesianGrid stroke="var(--chart-grid)" vertical={false}/><XAxis dataKey="label" {...axis}/><YAxis width={60} {...axis}/><DashboardTooltip formatter={currency}/><Legend/><Bar dataKey="value" name="Billed" fill="var(--chart-1)" radius={[4,4,0,0]}/><Bar dataKey="collected" name="Collected" fill="var(--chart-positive)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></ChartBox>
 <ChartBox title="Top 5 clients"><MoneyBars items={d.clients} horizontal max={5}/></ChartBox>
 <ChartBox title="Top products & services"><MoneyBars items={d.productsBySales} horizontal max={5}/></ChartBox>
 <ChartBox title="Invoice status mix"><div className="h-[230px]" role="img" aria-label="Quarterly paid unpaid and overdue invoice donut">
 <ResponsiveContainer><PieChart><Pie data={Object.entries(q.status).filter(([,value])=>value>0).map(([name,value])=>({name,value}))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78}>
 {Object.entries(q.status).filter(([,value])=>value>0).map(([name])=><Cell key={name} fill={name==='paid'?'var(--chart-positive)':name==='overdue'?'var(--chart-negative)':'var(--chart-1)'}/>)}
 </Pie><DashboardTooltip/><Legend/></PieChart></ResponsiveContainer></div>
 <div className="mt-2 flex flex-wrap gap-2">{Object.entries(q.status).map(([key,n])=><span key={key} className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs capitalize text-fg-muted">{key}: {n}</span>)}</div></ChartBox>
 <ChartBox title="Delivery progress"><div className="grid grid-cols-2 gap-3"><Tile title="Delivered" value={q.delivery.delivered} tone="success" onClick={()=>open({dateFrom:d.period.from,dateTo:d.period.to,deliveryStatus:'Delivered'})}/><Tile title="Pending" value={q.delivery.pending} onClick={()=>open({dateFrom:d.period.from,dateTo:d.period.to,deliveryStatus:'Pending'})}/></div></ChartBox>
 </div>
 </div>;
}
function Loading(){return <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard"><div className="grid gap-3 sm:grid-cols-3">{[0,1,2].map(n=><Skeleton key={n} className="h-28"/>)}</div><Skeleton className="h-[315px]"/><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80"/><Skeleton className="h-80"/></div></div>;}
export default function Dashboard(){
 const [search,setSearch]=useSearchParams();const navigate=useNavigate();
 const selected=VALID.includes(search.get('range'))?search.get('range'):'month';
 const [d,setD]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [details,setDetails]=useState(null);
 const [refresh,setRefresh]=useState(0);
 const current=today(),bounds=dashboardBounds(selected,current);
 useEffect(()=>{
   let live=true;setLoading(true);setD(null);
   api(`/api/dashboard/period-report?${qs({range:selected})}`)
     .then(r=>{if(live){setD(r);setError('');}})
     .catch(e=>{if(live)setError(e.message);})
     .finally(()=>{if(live)setLoading(false);});
   return ()=>{live=false;};
 },[selected,refresh,current]);
 const choose=(value)=>{setDetails(null);const next=new URLSearchParams(search);next.set('range',value);setSearch(next,{replace:true});};
 const open=(filters={})=>navigate(`/invoices?${qs(filters)}`);
 return <div className="space-y-5">
 <PageHeader title="Dashboard" description="Invoice and sales performance" actions={<button type="button" className="btn btn-secondary" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15} className={loading?'animate-spin':''}/>Refresh</button>}/>
 <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Dashboard period">
  <CalendarDays size={18} className="text-fg-muted" aria-hidden="true"/>
  {VALID.map(key=><button type="button" key={key} onClick={()=>choose(key)} aria-pressed={selected===key}
    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand ${selected===key?'border-brand bg-brand-soft text-brand-ink':'border-line bg-surface text-fg-muted hover:bg-surface-2'}`}>{key==='month'?'This Month':key==='year'?'This Year':`This Quarter – Q${bounds.quarter}`}</button>)}
 </div>
 {error&&<div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{error}</div>}
 {loading?<Loading/>:!d?<Empty label="Could not load dashboard"/>:d.kpis.invoiceCount===0?<div className="card card-pad"><Empty label="No invoices in this period"/></div>:
 selected==='month'?<MonthView key="month" d={d} open={open} onDetails={setDetails}/>:
 selected==='quarter'?<QuarterView key="quarter" d={d} open={open}/>:
 <YearView key="year" d={d} open={open}/>}
 {details&&<Modal title={details.title} description="Invoices in the selected period" width="max-w-3xl" onClose={()=>setDetails(null)} footer={<button type="button" className="btn btn-secondary" onClick={()=>setDetails(null)}>Close</button>}>
 <List rows={details.records} onOpen={row=>open({q:row.invoice_no})}/>
 </Modal>}
 </div>;
}
