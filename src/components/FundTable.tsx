import { useMemo, useState } from "react";
import type { Fund } from "../lib/db";
import { label, pct, tl, tone } from "../lib/format";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Col = { key: keyof Fund; head: string; fmt: (v: any) => string; color?: boolean };
const R = (key: keyof Fund, head: string): Col => ({ key, head, fmt: pct, color: true });
const F = (key: keyof Fund, head: string): Col => ({ key, head, fmt: tl, color: true });
const RISK: Col = { key: "risk", head: "Risk", fmt: (v) => v ?? "–" };
const VIEWS: Record<string, { name: string; cols: Col[] }> = {
  getiri: { name: "Getiri", cols: [R("d1", "1G"), R("w1", "1H"), R("m1", "1A"), R("m3", "3A"), R("m6", "6A"), R("ytd", "YBB"), R("y1", "1Y"), R("y2", "2Y"), R("y3", "3Y"), R("y5", "5Y"), RISK] },
  buyukluk: { name: "Büyüklük", cols: [{ key: "size", head: "Büyüklük", fmt: tl }, { key: "investors", head: "Yatırımcı", fmt: (v) => v?.toLocaleString("tr-TR") ?? "–" }, { key: "price", head: "Fiyat", fmt: (v) => v?.toFixed(4) ?? "–" }, RISK] },
  nakit: { name: "Nakit Giriş-Çıkışı", cols: [F("flow_w1", "1 Hafta"), F("flow_m1", "1 Ay"), F("flow_m3", "3 Ay"), { key: "size", head: "Büyüklük", fmt: tl }] },
};
const MAX_COMPARE = 10;

// Hızlı filtreler (aç/kapa)
const FLAGS: { key: keyof Fund; name: string }[] = [
  { key: "fx", name: "Döviz cinsi" }, { key: "islamic", name: "Katılım" }, { key: "stockFocus", name: "Hisse yoğun" },
  { key: "qualified", name: "Nitelikli / Özel" }, { key: "oks", name: "OKS" },
];

const EMPTY = { q: "", type: "", founder: "", cat: "", flags: [] as string[], riskMin: "", riskMax: "", invMin: "", invMax: "", sizeMin: "", sizeMax: "", stockMin: "" };
const sel = "h-8 rounded-lg border bg-transparent px-2 text-sm";

export default function FundTable({ funds }: { funds: Fund[] }) {
  const [view, setView] = useState("getiri");
  const [f, setF] = useState(EMPTY);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const [sort, setSort] = useState<{ key: keyof Fund; dir: 1 | -1 }>({ key: "size", dir: -1 });
  const [limit, setLimit] = useState(100);
  const [picked, setPicked] = useState<string[]>([]);

  const opts = useMemo(() => {
    const uniq = (k: keyof Fund) => [...new Set(funds.map((x) => x[k] as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    return {
      types: uniq("type"), founders: uniq("founder"),
      cats: uniq("main").sort((a, b) => label(a).localeCompare(label(b), "tr")),
      flags: FLAGS.filter((fl) => funds.some((x) => x[fl.key])),
    };
  }, [funds]);

  const rows = useMemo(() => {
    const s = f.q.trim().toLocaleLowerCase("tr");
    const n = (v: string) => (v === "" ? null : Number(v));
    const [riskMin, riskMax, invMin, invMax, sizeMin, sizeMax, stockMin] = [f.riskMin, f.riskMax, f.invMin, f.invMax, f.sizeMin, f.sizeMax, f.stockMin].map(n);
    return funds
      .filter((x) =>
        (!s || (x.code + x.name).toLocaleLowerCase("tr").includes(s)) &&
        (!f.type || x.type === f.type) && (!f.founder || x.founder === f.founder) && (!f.cat || x.main === f.cat) &&
        f.flags.every((k) => x[k as keyof Fund]) &&
        (riskMin == null || (x.risk != null && x.risk >= riskMin)) && (riskMax == null || (x.risk != null && x.risk <= riskMax)) &&
        (invMin == null || (x.investors ?? 0) >= invMin) && (invMax == null || (x.investors ?? 0) <= invMax) &&
        (sizeMin == null || x.size >= sizeMin * 1e6) && (sizeMax == null || x.size <= sizeMax * 1e6) &&
        (stockMin == null || x.stock >= stockMin))
      .sort((a, b) => {
        const x = a[sort.key] as any, y = b[sort.key] as any;
        return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [funds, f, sort]);

  // Kategori bazında net nakit girişi (1 ay), filtrelenmiş fonlar üzerinden
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of rows) if (x.flow_m1 != null) m.set(x.type, (m.get(x.type) ?? 0) + x.flow_m1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);
  const cols = VIEWS[view].cols;
  const th = (key: keyof Fund, head: string, right = true) => (
    <TableHead key={key} className={`cursor-pointer select-none whitespace-nowrap ${right ? "text-right" : ""}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
      {head}{sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </TableHead>
  );
  const num = (k: keyof typeof EMPTY, ph: string, w = "w-28") => (
    <Input className={w} type="number" placeholder={ph} value={f[k] as string} onChange={(e) => set({ [k]: e.target.value })} />
  );
  const riskSel = (k: "riskMin" | "riskMax", ph: string) => (
    <select className={sel} value={f[k]} onChange={(e) => set({ [k]: e.target.value })}>
      <option value="">{ph}</option>
      {[1, 2, 3, 4, 5, 6, 7].map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* hızlı filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="Fon kodu veya adı…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        <select className={sel} value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">Tüm fon türleri</option>
          {opts.types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className={`${sel} max-w-56`} value={f.founder} onChange={(e) => set({ founder: e.target.value })}>
          <option value="">Tüm kurucular (PYŞ)</option>
          {opts.founders.map((t) => <option key={t}>{t}</option>)}
        </select>
        {opts.flags.map((fl) => (
          <Button key={fl.key} size="sm" variant={f.flags.includes(fl.key) ? "default" : "outline"}
            onClick={() => set({ flags: f.flags.includes(fl.key) ? f.flags.filter((k) => k !== fl.key) : [...f.flags, fl.key] })}>
            {fl.name}
          </Button>
        ))}
        {active && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>Temizle</Button>}
        {picked.length > 0 && (
          <Button className="ml-auto" onClick={() => (location.href = `/karsilastir?codes=${picked.join(",")}`)}>Karşılaştır ({picked.length})</Button>
        )}
      </div>

      {/* Tüm Filtreler */}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Tüm Filtreler</summary>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1"><div className="text-muted-foreground">Baskın varlık</div>
            <select className={`${sel} w-full`} value={f.cat} onChange={(e) => set({ cat: e.target.value })}>
              <option value="">Tümü</option>
              {opts.cats.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </label>
          <div className="space-y-1"><div className="text-muted-foreground">Risk değeri (1–7, tahmini)</div>
            <div className="flex items-center gap-2">{riskSel("riskMin", "Min")}–{riskSel("riskMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Yatırımcı sayısı</div>
            <div className="flex items-center gap-2">{num("invMin", "Min")}–{num("invMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Fon büyüklüğü (mn ₺)</div>
            <div className="flex items-center gap-2">{num("sizeMin", "Min")}–{num("sizeMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Hisse ağırlığı en az (%)</div>{num("stockMin", "Örn. 50")}</div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Risk değeri son 1 yılın günlük getiri volatilitesinden hesaplanır (resmi değer değildir). Yönetim ücreti, stopaj ve TEFAS açık/kapalı bilgisi TEFAS API'sinde yok.
        </p>
      </details>

      <Tabs value={view} onValueChange={(v) => setView(v as string)}>
        <TabsList>{Object.entries(VIEWS).map(([k, v]) => <TabsTrigger key={k} value={k}>{v.name}</TabsTrigger>)}</TabsList>
      </Tabs>

      {view === "nakit" && byCat.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Fon türü bazında 1 aylık net giriş:</span>
          {byCat.slice(0, 6).map(([k, v]) => <Badge key={k} variant="outline" className={tone(v)}>{k} {tl(v)}</Badge>)}
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              {th("code", "Kod", false)}
              {th("name", "Fon", false)}
              {cols.map((c) => th(c.key, c.head))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((x) => (
              <TableRow key={x.code}>
                <TableCell>
                  <input type="checkbox" checked={picked.includes(x.code)} disabled={!picked.includes(x.code) && picked.length >= MAX_COMPARE}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, x.code] : picked.filter((c) => c !== x.code))} />
                </TableCell>
                <TableCell className="font-medium"><a className="hover:underline" href={`/fon/${x.code}`}>{x.code}</a></TableCell>
                <TableCell className="max-w-xs truncate" title={`${x.name}\n${x.founder}`}>{x.name} <Badge variant="secondary" className="ml-1">{x.type}</Badge></TableCell>
                {cols.map((c) => (
                  <TableCell key={c.key} className={`text-right tabular-nums ${c.color ? tone(x[c.key] as number) : ""}`}>{c.fmt(x[c.key])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{rows.length} fon{rows.length > limit && `, ilk ${limit} gösteriliyor`}</span>
        {rows.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 200)}>Daha fazla</Button>}
      </div>
    </div>
  );
}
