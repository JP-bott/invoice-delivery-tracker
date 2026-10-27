import { Tooltip as RechartsTooltip } from 'recharts';

// Recharts renders this tooltip with the theme currently defined by CSS tokens.
// Explicit heading, label, and value colors prevent unreadable text in dark mode.
export function ChartTooltipContent({active,payload,label,formatter,labelKey}) {
  if (!active || !payload?.length) return null;
  const heading=labelKey ? payload[0]?.payload?.[labelKey] : label;
  return <div className="chart-tooltip" role="status">
    {heading != null && heading!=='' && <div className="mb-1.5 font-semibold" style={{color:'var(--tooltip-fg)'}}>{heading}</div>}
    <div className="space-y-1">{payload.map((item,index)=><div key={item.dataKey || item.name || index} className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-1.5 chart-tooltip-muted">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{background:item.color||item.fill||item.payload?.fill||'var(--chart-1)'}} aria-hidden="true"/>
        <span className="truncate">{item.name||'Total'}</span>
      </span>
      <span className="num shrink-0 font-semibold" style={{color:'var(--tooltip-fg)'}}>{formatter ? formatter(item.value,item) : item.value}</span>
    </div>)}</div>
  </div>;
}

export default function DashboardTooltip({formatter,labelKey,...props}) {
  return <RechartsTooltip
    {...props}
    cursor={props.cursor ?? {fill:'var(--chart-hover-fill)',stroke:'var(--chart-hover-stroke)',strokeWidth:0.65}}
    wrapperStyle={{outline:'none',zIndex:10,pointerEvents:'none'}}
    content={args=><ChartTooltipContent {...args} formatter={formatter} labelKey={labelKey}/>}
  />;
}
