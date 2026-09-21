import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "./ui/button";

type Series = { code: string; history: { date: string; price: number }[] };
const RANGES: [string, number][] = [["1A", 30], ["3A", 91], ["6A", 182], ["1Y", 365]];
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#475569"];

// Seçili aralığın başını 100 kabul edip fonları aynı eksende kıyaslar
export default function CompareChart({ series }: { series: Series[] }) {
  const [range, setRange] = useState(365);
  const cut = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10);
  const byDate = new Map<string, Record<string, number>>();
  for (const s of series) {
    const h = s.history.filter((r) => r.date >= cut);
    const base = h[0]?.price;
    if (!base) continue;
    for (const r of h) byDate.set(r.date, { ...byDate.get(r.date), [s.code]: (r.price / base) * 100 });
  }
  const data = [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, ...v }));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {RANGES.map(([l, d]) => <Button key={l} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>{l}</Button>)}
      </div>
      <div className="h-72 sm:h-96">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v: number) => v.toFixed(2)} />
            <Legend />
            {series.map((s, i) => <Line key={s.code} dataKey={s.code} stroke={COLORS[i % COLORS.length]} dot={false} connectNulls strokeWidth={1.8} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
