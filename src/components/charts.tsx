import { fmtNum } from "@/lib/utils";
import { useBrandColor } from "@/lib/theme";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

const tooltipStyle = {
  contentStyle: { background: "#fff", border: "1px solid #DFE5E2", borderRadius: 12, fontSize: 12, boxShadow: "0 4px 16px rgba(16,24,20,.08)" },
  labelStyle: { color: "#66736C" },
  itemStyle: { color: "#111814" },
  cursor: { stroke: "#DFE5E2", fill: "rgba(16,24,20,0.03)" },
};

type P = { data: any[]; x: string; y: string; unit?: string; height?: number; name?: string; formatter?: (v: number) => string };

export function AreaTrend({ data, x, y, unit = "", height = 200, name, formatter }: P) {
  const LIME = useBrandColor();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${y}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LIME} stopOpacity={0.35} />
            <stop offset="100%" stopColor={LIME} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={formatter ?? ((v: number) => fmtNum(v, 1))} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any) => [formatter ? formatter(v) : `${v} ${unit}`, name ?? y]} />
        <Area type="monotone" dataKey={y} stroke={LIME} strokeWidth={2.5} fill={`url(#g-${y})`} dot={{ r: 2.5, fill: LIME }} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarTrend({ data, x, y, unit = "", height = 200, name, formatter }: P) {
  const LIME = useBrandColor();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={formatter ?? ((v: number) => fmtNum(v, 1))} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any) => [formatter ? formatter(v) : `${v} ${unit}`, name ?? y]} />
        <Bar dataKey={y} fill={LIME} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const PALETTE = ["#0EA5E9", "#F59E0B", "#8B5CF6", "#14B8A6", "#EC4899", "#64748B"];

export function MultiLine({ data, x, lines, height = 220, unit = "" }: { data: any[]; x: string; lines: { key: string; name: string }[]; height?: number; unit?: string }) {
  const brand = useBrandColor();
  const colors = [brand, ...PALETTE];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtNum(v, 1)} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [`${v} ${unit}`, n]} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#8A938E" }} iconType="circle" iconSize={8} />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
