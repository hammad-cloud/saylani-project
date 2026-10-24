import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from './ui';

// Navy/blue/teal family first, status colours after; matches the tokens in index.css.
// Recharts animates in JS, so the CSS reduced-motion rule cannot reach it.
const ANIMATE = typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const PALETTE = ['#1f4e79', '#14b8a6', '#142b4a', '#6b9bc3', '#b7791f', '#16803d', '#c0392b'];

const axis = { fontSize: 11, fill: '#64748b' };
const tooltipStyle = { contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 } };

export function ChartCard({ title, children, empty, action }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {empty ? <EmptyState title="No data yet" hint="This fills in as people use the app." /> : <div className="h-64">{children}</div>}
    </div>
  );
}

export function SimpleBar({ data, x, bars, stacked, format }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={format} allowDecimals={false} />
        <Tooltip {...tooltipStyle} formatter={format ? (v) => format(v) : undefined} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color || PALETTE[i]} radius={[6, 6, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={22} isAnimationActive={ANIMATE} animationDuration={700} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, x, y, name, unit = '' }) {
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
        <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 100]} unit={unit} />
        <Tooltip {...tooltipStyle} formatter={(v) => `${v}${unit}`} />
        <Area type="monotone" dataKey={y} name={name} stroke="#0f766e" strokeWidth={2} fill="url(#trendFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={ANIMATE} animationDuration={800} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="82%" paddingAngle={3} cornerRadius={6} isAnimationActive={ANIMATE}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
