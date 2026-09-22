import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Fund } from "../lib/db";
import { decodeFunds } from "../lib/compact";
import { fold } from "../lib/classify";
import { label, pct, tl, tone } from "../lib/format";
import { useFavorites } from "../lib/favorites";
import { FavStar } from "./FavStar";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
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

const EMPTY = { q: "", status: "aktif", type: "", founder: "", cat: "", flags: [] as string[], riskMin: "", riskMax: "", invMin: "", invMax: "", sizeMin: "", sizeMax: "", stockMin: "", stock: "", stockW: "" };
const ALL = "__all"; // base-ui boş string değerini "seçim yok" sayar; "hepsi" için sabit değer kullan

// Sayfa içinde çizilen (shadcn/base-ui) seçim kutusu; doğal <select> açılır listesi yerine.
function Pick({ value, onChange, all, items, className }: { value: string; onChange: (v: string) => void; all: string; items: { value: string; label: string }[]; className?: string }) {
  const list = [{ value: ALL, label: all }, ...items];
  return (
    <Select items={list} value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : String(v))}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72" alignItemWithTrigger={false}>
        {list.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Liste verisi sayfaya gömülmez, ayrı (önbelleklenebilir) JSON'dan gelir; sayfa kabuğu <link rel=preload> ile erken başlatır.
export default function FundTable({ src, favOnly = false }: { src: string; favOnly?: boolean }) {
  const [data, setData] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetch(src).then((r) => (r.ok ? r.text() : Promise.reject())).then(setData).catch(() => setErr(true)); }, [src]);
  if (err) return <p className="text-muted-foreground">Liste yüklenemedi; sayfayı yenileyin.</p>;
  if (data == null) return <p className="text-muted-foreground">Yükleniyor…</p>;
  return <FundTableView data={data} favOnly={favOnly} />;
}

function FundTableView({ data, favOnly }: { data: string; favOnly: boolean }) {
  const funds = useMemo(() => decodeFunds(data), [data]);
  const { favs, toggle } = useFavorites();
  const empty = favOnly ? { ...EMPTY, status: "" } : EMPTY; // pasif fon da favori olabilir
  const [view, setView] = useState("getiri");
  const [f, setF] = useState(empty);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const [sort, setSort] = useState<{ key: keyof Fund; dir: 1 | -1 }>({ key: "size", dir: -1 });
  const [limit, setLimit] = useState(100);
  // Sonsuz kaydırma: tablonun altındaki gözcü görününce +100 satır daha çiz
  const end = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Hisse filtresi (KAP portföy raporu): ?hisse=EREGL ile de açılır
  const [byStock, setByStock] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("hisse");
    if (q) set({ stock: q.toUpperCase(), stockW: "1" });
  }, []);
  useEffect(() => {
    const t = f.stock.trim().toUpperCase();
    if (t.length < 2) return setByStock(null);
    const id = setTimeout(() => fetch(`/api/holdings?ticker=${t}&min=${Number(f.stockW) || 0}`).then((r) => r.json()).then(setByStock).catch(() => setByStock({})), 250);
    return () => clearTimeout(id);
  }, [f.stock, f.stockW]);

  const opts = useMemo(() => {
    const uniq = (k: keyof Fund) => [...new Set(funds.map((x) => x[k] as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    return {
      types: uniq("type"), founders: uniq("founder"),
      cats: uniq("main").sort((a, b) => label(a).localeCompare(label(b), "tr")),
      flags: FLAGS.filter((fl) => funds.some((x) => x[fl.key])),
    };
  }, [funds]);

  // yazarken girdi hemen güncellenir, 2000 satırlık filtre/sıralama ertelenmiş değerle yapılır
  const df = useDeferredValue(f);
  const rows = useMemo(() => {
    const s = fold(df.q.trim());
    const n = (v: string) => (v === "" ? null : Number(v));
    const [riskMin, riskMax, invMin, invMax, sizeMin, sizeMax, stockMin] = [df.riskMin, df.riskMax, df.invMin, df.invMax, df.sizeMin, df.sizeMax, df.stockMin].map(n);
    return funds
      .filter((x) =>
        (!favOnly || favs.has(x.code)) && (!s || x.hay.includes(s)) &&
        (!df.status || x.active === (df.status === "aktif")) && (!df.type || x.type === df.type) && (!df.founder || x.founder === df.founder) && (!df.cat || x.main === df.cat) &&
        df.flags.every((k) => x[k as keyof Fund]) &&
        (riskMin == null || (x.risk != null && x.risk >= riskMin)) && (riskMax == null || (x.risk != null && x.risk <= riskMax)) &&
        (invMin == null || (x.investors ?? 0) >= invMin) && (invMax == null || (x.investors ?? 0) <= invMax) &&
        (sizeMin == null || x.size >= sizeMin * 1e6) && (sizeMax == null || x.size <= sizeMax * 1e6) &&
        (stockMin == null || x.stock >= stockMin) &&
        (df.stock.trim().length < 2 || (byStock != null && x.code in byStock)))
      .sort((a, b) => {
        const x = a[sort.key] as any, y = b[sort.key] as any;
        return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [funds, df, sort, byStock, favOnly, favs]);

  // Kategori bazında net nakit girişi (1 ay), filtrelenmiş fonlar üzerinden
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of rows) if (x.flow_m1 != null) m.set(x.type, (m.get(x.type) ?? 0) + x.flow_m1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  useEffect(() => {
    if (!end.current || rows.length <= limit) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + 100), { rootMargin: "600px" });
    io.observe(end.current);
    return () => io.disconnect(); // limit değişince yeniden kurulur; gözcü hâlâ görünüyorsa tekrar tetiklenir
  }, [rows.length, limit]);

  const active = JSON.stringify(f) !== JSON.stringify(empty);
  const stockCol: Col[] = byStock && f.stock.trim().length >= 2 ? [{ key: "code", head: `${f.stock.toUpperCase()} %`, fmt: () => "" }] : [];
  const cols = VIEWS[view].cols;
  const th = (key: keyof Fund, head: string, right = true) => (
    <TableHead key={key} className={`cursor-pointer select-none whitespace-nowrap ${right ? "text-right" : ""}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
      {head}{sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </TableHead>
  );
  const num = (k: keyof typeof EMPTY, ph: string, w = "min-w-0 flex-1 sm:w-28 sm:flex-none") => (
    <Input className={w} type="number" placeholder={ph} value={f[k] as string} onChange={(e) => set({ [k]: e.target.value })} />
  );
  const riskItems = [1, 2, 3, 4, 5, 6, 7].map((r) => ({ value: String(r), label: String(r) }));
  const riskSel = (k: "riskMin" | "riskMax", ph: string) => <Pick className="w-20" value={f[k]} onChange={(v) => set({ [k]: v })} all={ph} items={riskItems} />;

  return (
    <div className="space-y-4">
      {/* hızlı filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-56" placeholder="Fon kodu veya adı…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        <Pick className="w-full sm:w-36" value={f.status} onChange={(v) => set({ status: v })} all="Aktif + pasif" items={[{ value: "aktif", label: "TEFAS'ta aktif" }, { value: "pasif", label: "TEFAS'ta pasif" }]} />
        <Pick className="w-full sm:w-44" value={f.type} onChange={(v) => set({ type: v })} all="Tüm fon türleri" items={opts.types.map((t) => ({ value: t, label: t }))} />
        <Pick className="w-full sm:w-56" value={f.founder} onChange={(v) => set({ founder: v })} all="Tüm kurucular (PYŞ)" items={opts.founders.map((t) => ({ value: t, label: t }))} />
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Input className="min-w-0 flex-1 uppercase sm:w-36 sm:flex-none" placeholder="Hisse (EREGL)" value={f.stock} onChange={(e) => set({ stock: e.target.value })} />
          <Input className="min-w-0 flex-1 sm:w-24 sm:flex-none" type="number" placeholder="≥ % ağırlık" value={f.stockW} onChange={(e) => set({ stockW: e.target.value })} />
        </div>
        {opts.flags.map((fl) => (
          <Button key={fl.key} size="sm" variant={f.flags.includes(fl.key) ? "default" : "outline"}
            onClick={() => set({ flags: f.flags.includes(fl.key) ? f.flags.filter((k) => k !== fl.key) : [...f.flags, fl.key] })}>
            {fl.name}
          </Button>
        ))}
        {active && <Button size="sm" variant="ghost" onClick={() => setF(empty)}>Temizle</Button>}
        {picked.length > 0 && (
          <Button className="ml-auto" onClick={() => (location.href = `/karsilastir?codes=${picked.join(",")}`)}>Karşılaştır ({picked.length})</Button>
        )}
      </div>

      {/* Tüm Filtreler */}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Tüm Filtreler</summary>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><div className="text-muted-foreground">Baskın varlık</div>
            <Pick className="w-full" value={f.cat} onChange={(v) => set({ cat: v })} all="Tümü" items={opts.cats.map((c) => ({ value: c, label: label(c) }))} />
          </div>
          <div className="space-y-1"><div className="text-muted-foreground">Risk değeri (1–7, tahmini)</div>
            <div className="flex items-center gap-2">{riskSel("riskMin", "Min")}–{riskSel("riskMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Yatırımcı sayısı</div>
            <div className="flex items-center gap-2">{num("invMin", "Min")}–{num("invMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Fon büyüklüğü (mn ₺)</div>
            <div className="flex items-center gap-2">{num("sizeMin", "Min")}–{num("sizeMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">TEFAS hisse ağırlığı en az (%)</div>{num("stockMin", "Örn. 50")}</div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Risk değeri son 1 yılın günlük getiri volatilitesinden hesaplanır (resmi değer değildir). Aktif: fonun TEFAS'ta son 7 gün içinde veri yayımlaması ve KAP'ta tasfiye duyurusu olmaması; pasif fonlarda (tasfiye/birleşme) getiri ve nakit akışı gösterilmez. Yönetim ücreti, stopaj ve TEFAS işlem açık/kapalı bilgisi TEFAS API'sinde yok.
        </p>
      </details>

      <Tabs className="max-w-full overflow-x-auto" value={view} onValueChange={(v) => setView(v as string)}>
        <TabsList>{Object.entries(VIEWS).map(([k, v]) => <TabsTrigger key={k} value={k}>{v.name}</TabsTrigger>)}</TabsList>
      </Tabs>

      {view === "nakit" && byCat.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Fon türü bazında 1 aylık net giriş:</span>
          {byCat.slice(0, 6).map(([k, v]) => <Badge key={k} variant="outline" className={tone(v)}>{k} {tl(v)}</Badge>)}
        </div>
      )}

      {favOnly && favs.size === 0 && <p className="text-muted-foreground">Henüz favori fon yok. Fon listelerinde ya da fon sayfasında ★ ile ekleyin.</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14" />
              {th("code", "Kod", false)}
              {th("name", "Fon", false)}
              {stockCol.length > 0 && <TableHead className="text-right whitespace-nowrap">{stockCol[0].head}</TableHead>}
              {cols.map((c) => th(c.key, c.head))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((x) => (
              <TableRow key={x.code} className="cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,a,button")) return; // onay kutusu, yıldız ve kod bağlantısı kendi işini yapar
                  if (e.metaKey || e.ctrlKey) window.open(`/fon/${x.code}`, "_blank");
                  else location.href = `/fon/${x.code}`;
                }}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <input type="checkbox" checked={picked.includes(x.code)} disabled={!picked.includes(x.code) && picked.length >= MAX_COMPARE}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, x.code] : picked.filter((c) => c !== x.code))} />
                    <FavStar on={favs.has(x.code)} onClick={() => toggle(x.code)} />
                  </div>
                </TableCell>
                <TableCell className="font-medium"><a className="hover:underline" href={`/fon/${x.code}`}>{x.code}</a></TableCell>
                <TableCell className="max-w-xs truncate" title={`${x.name}\n${x.founder}`}>{x.name} <Badge variant="secondary" className="ml-1">{x.type}</Badge>{!x.active && <Badge variant="outline" className="ml-1 text-red-600">Pasif</Badge>}</TableCell>
                {stockCol.length > 0 && <TableCell className="text-right font-medium tabular-nums">{byStock?.[x.code]?.toFixed(2)}%</TableCell>}
                {cols.map((c) => (
                  <TableCell key={c.key} className={`text-right tabular-nums ${c.color ? tone(x[c.key] as number) : ""}`}>{c.fmt(x[c.key])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div ref={end} className="text-sm text-muted-foreground">
        {rows.length} fon{rows.length > limit && `, ilk ${limit} gösteriliyor (kaydırdıkça yüklenir)`}
      </div>
    </div>
  );
}
