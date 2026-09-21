import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "./ui/button";
import { tl } from "../lib/format";

type H = { date: string; price: number; size: number; investors: number }[];
const RANGES: [string, number][] = [["1A", 30], ["3A", 91], ["6A", 182], ["1Y", 365]];
const METRICS = { price: ["Fiyat", (v: number) => v.toFixed(2)], size: ["Büyüklük", tl], investors: ["Yatırımcı", (v: number) => v.toLocaleString("tr-TR")] } as const;

export default function FundCharts({ history }: { history: H }) {
  const [range, setRange] = useState(365);
  const [metric, setMetric] = useState<keyof typeof METRICS>("price");
  const cut = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10);
  const data = history.filter((h) => h.date >= cut);
  const [, fmt] = METRICS[metric];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((m) => (
          <Button key={m} size="sm" variant={metric === m ? "default" : "outline"} onClick={() => setMetric(m)}>{METRICS[m][0]}</Button>
        ))}
        <span className="mx-2" />
        {RANGES.map(([l, d]) => <Button key={l} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>{l}</Button>)}
      </div>
      <div className="h-72">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={70} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Area type="monotone" dataKey={metric} stroke="var(--color-chart-1, #2563eb)" fill="var(--color-chart-1, #2563eb)" fillOpacity={0.15} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
