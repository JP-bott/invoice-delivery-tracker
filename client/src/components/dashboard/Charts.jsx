import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { peso } from '../../utils/api.js';
import { STATUS_COLORS } from '../../utils/constants.js';
import ChartCard from './ChartCard.jsx';

export const TrendChart = ({ data }) => (
  <ChartCard title="Invoice Value Over Time" data={data}>
    <ResponsiveContainer width="100%" height={240}><AreaChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Area dataKey="value" stroke="#4f46e5" fill="#e0e7ff" /></AreaChart></ResponsiveContainer>
  </ChartCard>
);

export const StatusChart = ({ data }) => (
  <ChartCard title="Payment Status Distribution" data={data}>
    <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={data} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} label={({ percent }) => `${Math.round(percent * 100)}%`}>{data.map((x) => <Cell key={x.status} fill={STATUS_COLORS[x.status]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
  </ChartCard>
);

export const TopClientsChart = ({ data }) => (
  <ChartCard title="Top Clients" data={data}>
    <ResponsiveContainer width="100%" height={260}><BarChart data={data} layout="vertical"><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={110} fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="value" fill="#4f46e5" /></BarChart></ResponsiveContainer>
  </ChartCard>
);

export const TopProductsChart = ({ data }) => (
  <ChartCard title="Top Products/Services" data={data}>
    <ResponsiveContainer width="100%" height={260}><BarChart data={data}><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="value" fill="#4f46e5" /></BarChart></ResponsiveContainer>
  </ChartCard>
);
