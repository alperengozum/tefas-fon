import { useEffect, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "./ui/button";
import { FundCombobox, useFundOptions } from "./FundCombobox";
import { tl } from "../lib/format";

export type Row = { code: string | null; mode: "tl" | "adet"; value: string };
const KEY = "portfoy.v2"; // JSON: Row[] (sunucu tarafı ?f=KOD:tl:5000&f=KOD:adet:120 ile aynı bilgi)
const url = (rows: Row[]) => {
  const p = new URLSearchParams();
  for (const r of rows) if (r.code && Number(r.value) > 0) p.append("f", `${r.code}:${r.mode}:${Number(r.value)}`);
  return `/portfoy?${p}`;
};
const SELECT = "h-8 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

// Portföy girişi: her satırda aranabilir fon seçici + tutar (TL) ya da adet. Kayıt yalnız bu tarayıcıda (localStorage).
export default function PortfolioForm({ initial }: { initial: Row[] }) {
  const options = useFundOptions();
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ code: null, mode: "tl", value: "" }]);
  useEffect(() => {
    try {
      if (initial.length) localStorage.setItem(KEY, JSON.stringify(initial));
      else { const s = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Row[]; if (s.length) location.replace(url(s)); }
    } catch {}
  }, []);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const price = new Map(options.map((o) => [o.value, o.price]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = rows.filter((r) => r.code && Number(r.value) > 0);
    try { valid.length ? localStorage.setItem(KEY, JSON.stringify(valid)) : localStorage.removeItem(KEY); } catch {}
    location.href = url(valid);
  };
  return (
    <form onSubmit={submit} className="mb-6 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2" data-testid="portfoy-satir">
          <div className="w-full min-w-0 sm:w-96"><FundCombobox value={r.code} options={options} onChange={(code) => set(i, { code })} label={`Fon ${i + 1}`} /></div>
          <select aria-label="Giriş türü" value={r.mode} onChange={(e) => set(i, { mode: e.target.value as Row["mode"] })} className={SELECT}>
            <option value="tl">Tutar (₺)</option>
            <option value="adet">Adet (pay)</option>
          </select>
          <input type="number" inputMode="decimal" min="0" step="any" aria-label={r.mode === "tl" ? "Tutar (₺)" : "Adet"} placeholder={r.mode === "tl" ? "5000" : "100"} value={r.value}
            onChange={(e) => set(i, { value: e.target.value })} className={`${SELECT} w-32`} />
          {r.mode === "adet" && r.code && Number(r.value) > 0 && price.has(r.code) && <span className="text-xs text-muted-foreground">≈ {tl(Number(r.value) * price.get(r.code)!)}</span>}
          {rows.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Satır ${i + 1} sil`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><XIcon /></Button>}
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setRows([...rows, { code: null, mode: "tl", value: "" }])}><PlusIcon />Fon ekle</Button>
        <Button type="submit">Analiz et</Button>
      </div>
    </form>
  );
}
