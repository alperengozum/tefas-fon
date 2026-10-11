import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "./ui/button";
import { trDate } from "../lib/format";
import type { PremPt } from "../lib/premium";

const RANGES: [string, number][] = [["1A", 30], ["3A", 91], ["6A", 182], ["1Y", 365]];
const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

// BYF prim/iskonto zaman serisi; 0 çizgisi = borsa fiyatı NAV'a eşit
export default function PremiumChart({ series }: { series: PremPt[] }) {
  const [range, setRange] = useState(365);
  const last = series[series.length - 1]?.date ?? "";
  const cut = new Date(new Date(last).getTime() - range * 864e5).toISOString().slice(0, 10);
  const data = series.filter((p) => p.date >= cut).map((p) => ({ date: p.date, prem: Math.round(p.prem * 100) / 100 }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {RANGES.map(([l, d]) => <Button key={l} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>{l}</Button>)}
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted-foreground/30" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "currentColor" }} className="text-muted-foreground" minTickGap={40} tickFormatter={trDate} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "currentColor" }} className="text-muted-foreground" tickFormatter={fmt} width={64} />
            <ReferenceLine y={0} stroke="currentColor" className="text-muted-foreground" />
            <Tooltip labelFormatter={(l) => trDate(typeof l === "string" ? l : null)} formatter={(v) => [fmt(Number(v)), "Prim/iskonto"]} />
            <Line type="monotone" dataKey="prem" stroke="#d97706" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
