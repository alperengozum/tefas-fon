import { useEffect, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "./ui/button";
import { FundCombobox, useFundOptions } from "./FundCombobox";
import { tl } from "../lib/format";

// target: yeniden dengeleme için hedef ağırlık (%), boş olabilir
export type Row = { code: string | null; mode: "tl" | "adet"; value: string; target?: string };
export type Extra = { cash: string; noSell: boolean }; // dengelemede eklenecek yeni para, satış yapmadan
const KEY = "portfoy.v2"; // JSON: Row[] (sunucu tarafı ?f=KOD:tl:5000[:hedef]&f=KOD:adet:120 ile aynı bilgi)
const url = (rows: Row[], x: Extra = { cash: "", noSell: false }) => {
  const p = new URLSearchParams();
  for (const r of rows) if (r.code && Number(r.value) > 0) p.append("f", `${r.code}:${r.mode}:${Number(r.value)}${Number(r.target) > 0 ? `:${Number(r.target)}` : ""}`);
  if (Number(x.cash) > 0) p.set("nakit", String(Number(x.cash)));
  if (x.noSell) p.set("satma", "1");
  return `/portfoy?${p}`;
};
const SELECT = "h-8 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

// Portföy girişi: her satırda aranabilir fon seçici + tutar (TL) ya da adet + isteğe bağlı hedef %. Kayıt yalnız bu tarayıcıda (localStorage).
// add: fon detayından gelen kod (?ekle=); kayıtlı portföy yüklendikten sonra boş tutarlı satır olarak eklenir ve tutar kutusuna odaklanılır.
export default function PortfolioForm({ initial, extra, add }: { initial: Row[]; extra?: Extra; add?: string }) {
  const options = useFundOptions();
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ code: null, mode: "tl", value: "" }]);
  const [x, setX] = useState<Extra>(extra ?? { cash: "", noSell: false });
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (initial.length) localStorage.setItem(KEY, JSON.stringify(initial));
      else { const s = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Row[]; if (s.length) return location.replace(url(s) + (add ? `&ekle=${add}` : "")); }
    } catch {}
    if (!add) return;
    if (!initial.some((r) => r.code === add)) setRows((rs) => [...rs.filter((r) => r.code), { code: add, mode: "tl", value: "" }]);
    setFocus(add);
  }, []);
  useEffect(() => {
    if (!focus) return;
    document.querySelector<HTMLInputElement>(`[data-testid=portfoy-satir][data-code="${focus}"] input[type=number]`)?.focus();
    setFocus(null);
  }, [focus, rows]);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const price = new Map(options.map((o) => [o.value, o.price]));
  const targetSum = rows.reduce((s, r) => s + (Number(r.target) || 0), 0);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = rows.filter((r) => r.code && Number(r.value) > 0);
    try { valid.length ? localStorage.setItem(KEY, JSON.stringify(valid)) : localStorage.removeItem(KEY); } catch {}
    location.href = url(valid, x);
  };
  return (
    <form onSubmit={submit} className="mb-6 space-y-2">
      {add && <p className="text-sm" data-testid="portfoy-eklendi"><b>{add}</b> portföye eklendi: tutarı ya da adedi girip <b>Analiz et</b>'e bas.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2" data-testid="portfoy-satir" data-code={r.code ?? ""}>
          <div className="w-full min-w-0 sm:w-96"><FundCombobox value={r.code} options={options} onChange={(code) => set(i, { code })} label={`Fon ${i + 1}`} /></div>
          <select aria-label="Giriş türü" value={r.mode} onChange={(e) => set(i, { mode: e.target.value as Row["mode"] })} className={SELECT}>
            <option value="tl">Tutar (₺)</option>
            <option value="adet">Adet (pay)</option>
          </select>
          <input type="number" inputMode="decimal" min="0" step="any" aria-label={r.mode === "tl" ? "Tutar (₺)" : "Adet"} placeholder={r.mode === "tl" ? "5000" : "100"} value={r.value}
            onChange={(e) => set(i, { value: e.target.value })} className={`${SELECT} w-32`} />
          <input type="number" inputMode="decimal" min="0" max="100" step="any" aria-label={`Hedef % ${i + 1}`} placeholder="Hedef %" value={r.target ?? ""}
            onChange={(e) => set(i, { target: e.target.value })} className={`${SELECT} w-24`} />
          {r.mode === "adet" && r.code && Number(r.value) > 0 && price.has(r.code) && <span className="text-xs text-muted-foreground">≈ {tl(Number(r.value) * price.get(r.code)!)}</span>}
          {rows.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Satır ${i + 1} sil`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><XIcon /></Button>}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Yeniden dengeleme (isteğe bağlı):</span>
        <input type="number" inputMode="decimal" min="0" step="any" aria-label="Ek nakit (₺)" placeholder="Ek nakit (₺)" value={x.cash}
          onChange={(e) => setX({ ...x, cash: e.target.value })} className={`${SELECT} w-32`} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={x.noSell} onChange={(e) => setX({ ...x, noSell: e.target.checked })} />Satış yapmadan</label>
        {targetSum > 0 && <span className={`text-xs ${Math.abs(targetSum - 100) < 0.01 ? "text-muted-foreground" : "text-amber-600"}`}>Hedef toplamı %{targetSum.toLocaleString("tr-TR")}{Math.abs(targetSum - 100) >= 0.01 && " (100'e oranlanır)"}</span>}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setRows([...rows, { code: null, mode: "tl", value: "" }])}><PlusIcon />Fon ekle</Button>
        <Button type="submit">Analiz et</Button>
      </div>
    </form>
  );
}
