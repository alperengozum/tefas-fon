import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Fund } from "../lib/db";
import { decodeList } from "../lib/compact";
import { inBase, PERIOD_DAYS } from "../lib/analytics";
import { fold } from "../lib/classify";
import { download, toCsv, today } from "../lib/csv";
import { EMPTY, fromQuery, toQuery } from "../lib/listUrl";
import { type AssetRule, assetName, assetOptions, matches, ruleText, share } from "../lib/assets";
import { pct, price, tl, tone } from "../lib/format";
import { usePins } from "../lib/pins";
import { PinToggle } from "./PinButton";
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
  buyukluk: { name: "Büyüklük", cols: [{ key: "size", head: "Büyüklük", fmt: tl }, { key: "investors", head: "Yatırımcı", fmt: (v) => v?.toLocaleString("tr-TR") ?? "–" }, { key: "price", head: "Fiyat", fmt: price }, RISK] },
  risk: { name: "Risk", cols: [RISK, { key: "vol", head: "Volatilite 1Y", fmt: (v) => (v == null ? "–" : `${v.toFixed(2)}%`) }, R("mdd", "Maks. düşüş 1Y"), R("y1", "Getiri 1Y")] },
  nakit: { name: "Nakit Giriş-Çıkışı", cols: [F("flow_w1", "1 Hafta"), F("flow_m1", "1 Ay"), F("flow_m3", "3 Ay"), { key: "size", head: "Büyüklük", fmt: tl }] },
};
const MAX_COMPARE = 10;

// Hızlı filtreler (aç/kapa)
const FLAGS: { key: keyof Fund; name: string }[] = [
  { key: "fx", name: "Döviz cinsi" }, { key: "islamic", name: "Katılım" }, { key: "stockFocus", name: "Hisse yoğun" },
  { key: "qualified", name: "Nitelikli / Özel" }, { key: "oks", name: "OKS" },
];

// "Tüm Filtreler" paneli kapalıyken de kaç filtrenin açık olduğu görünsün
const PANEL = ["riskMin", "riskMax", "invMin", "invMax", "sizeMin", "sizeMax", "stockMin"] as const;
// Sıralama anahtarı: Fund alanı veya "@<varlık>" (varlık kuralı sütunu, ör. "@g:mevduat")
type SortKey = keyof Fund | `@${string}`;
const val = (x: Fund, k: SortKey): any => (k.startsWith("@") ? (x.alloc ? share(x.alloc, k.slice(1)) : null) : x[k as keyof Fund]);
const ALL = "__all"; // base-ui boş string değerini "seçim yok" sayar; "hepsi" için sabit değer kullan

// Sayfa içinde çizilen (shadcn/base-ui) seçim kutusu; doğal <select> açılır listesi yerine.
function Pick({ value, onChange, all, items, className }: { value: string; onChange: (v: string) => void; all: string; items: { value: string; label: string; sub?: boolean }[]; className?: string }) {
  const list = [{ value: ALL, label: all }, ...items];
  return (
    <Select items={list} value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : String(v))}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72" alignItemWithTrigger={false}>
        {list.map((i) => <SelectItem key={i.value} value={i.value} className={"sub" in i && i.sub ? "pl-6 text-muted-foreground" : ""}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Liste verisi sayfaya gömülmez, ayrı (önbelleklenebilir) JSON'dan gelir; sayfa kabuğu <link rel=preload> ile erken başlatır.
export default function FundTable({ src }: { src: string }) {
  const [data, setData] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { fetch(src).then((r) => (r.ok ? r.text() : Promise.reject())).then(setData).catch(() => setErr(true)); }, [src]);
  if (err) return <p className="text-muted-foreground">Liste yüklenemedi; sayfayı yenileyin.</p>;
  if (data == null) return <p className="text-muted-foreground">Yükleniyor…</p>;
  return <FundTableView data={data} />;
}

function FundTableView({ data }: { data: string }) {
  const list = useMemo(() => decodeList(data), [data]);
  // TL / USD: USD seçiliyken getiri alanları USD/TRY'nin aynı vadeli getirisine göre çevrilir (sıralama ve filtre de çevrilmiş değerle)
  const [ccy, setCcy] = useState<"TL" | "USD">("TL");
  const funds = useMemo(() => {
    const usd = list.usd;
    if (ccy === "TL" || !usd) return list.funds;
    return list.funds.map((x) => ({ ...x, ...Object.fromEntries(PERIOD_DAYS.map(([k]) => [k, inBase(x[k as keyof Fund] as number | null, usd[k])])) }));
  }, [list, ccy]);
  const { pins, toggle } = usePins();
  // Filtre, görünüm ve sıralama adresten başlar ve adrese yazılır (paylaşılabilir liste; bkz. lib/listUrl)
  const [init] = useState(() => fromQuery(location.search, Object.keys(VIEWS)));
  const [view, setView] = useState(init.view);
  const [f, setF] = useState(init.f);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(init.sort as { key: SortKey; dir: 1 | -1 });
  useEffect(() => {
    const q = toQuery({ f, view, sort });
    history.replaceState(history.state, "", q ? `${location.pathname}?${q}` : location.pathname);
  }, [f, view, sort]);
  const [copied, setCopied] = useState(false);
  const copyLink = () => navigator.clipboard?.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  // varlık kuralı taslağı (Ekle'ye basılınca f.assets'e geçer)
  const [draft, setDraft] = useState({ a: "", op: "has" as AssetRule["op"], min: "" });
  const [limit, setLimit] = useState(100);
  // Sonsuz kaydırma: tablonun altındaki gözcü görününce +100 satır daha çiz
  const end = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Hisse filtresi (KAP portföy raporu): ?hisse=EREGL ile de açılır (fromQuery)
  const [byStock, setByStock] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const t = f.stock.trim().toUpperCase();
    if (t.length < 2) return setByStock(null);
    const id = setTimeout(() => fetch(`/api/holdings?ticker=${encodeURIComponent(t)}&min=${Number(f.stockW) || 0}`).then((r) => r.json()).then(setByStock).catch(() => setByStock({})), 250);
    return () => clearTimeout(id);
  }, [f.stock, f.stockW]);

  const opts = useMemo(() => {
    const uniq = (k: keyof Fund) => [...new Set(funds.map((x) => x[k] as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    return {
      types: uniq("type"), founders: uniq("founder"),
      flags: FLAGS.filter((fl) => funds.some((x) => x[fl.key])),
      assets: assetOptions(new Set(funds.flatMap((x) => Object.keys(x.alloc ?? {})))),
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
        (!s || x.hay.includes(s)) &&
        (!df.status || x.active === (df.status === "aktif")) && (!df.type || x.type === df.type) && (!df.founder || x.founder === df.founder) &&
        df.flags.every((k) => x[k as keyof Fund]) &&
        (riskMin == null || (x.risk != null && x.risk >= riskMin)) && (riskMax == null || (x.risk != null && x.risk <= riskMax)) &&
        (invMin == null || (x.investors ?? 0) >= invMin) && (invMax == null || (x.investors ?? 0) <= invMax) &&
        (sizeMin == null || x.size >= sizeMin * 1e6) && (sizeMax == null || x.size <= sizeMax * 1e6) &&
        (stockMin == null || x.stock >= stockMin) &&
        df.assets.every((r) => matches(x.alloc, r)) &&
        (df.stock.trim().length < 2 || (byStock != null && x.code in byStock)))
      .sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        // pinlenen fonlar her sıralamada en üstte
        return +pins.has(b.code) - +pins.has(a.code) || (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
  }, [funds, df, sort, byStock, pins]);

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

  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);
  const stockCol: Col[] = byStock && f.stock.trim().length >= 2 ? [{ key: "code", head: `${f.stock.toUpperCase()} %`, fmt: () => "" }] : [];
  const cols = VIEWS[view].cols;
  // "içersin" kuralları tabloda sıralanabilir % sütunu olur
  const assetCols = f.assets.filter((r) => r.op === "has");
  const panelOn = PANEL.filter((k) => f[k]).length + f.assets.length;
  // CSV: filtrelenmiş ve sıralanmış tüm satırlar (ekrandaki 100 satır sınırı değil); ham sayılar (yüzde/₺ işareti yok)
  const exportCsv = () => {
    const extra = [
      ...(stockCol.length ? [[`${f.stock.toUpperCase()} ağırlık %`, (x: Fund) => byStock?.[x.code]] as const] : []),
      ...assetCols.map((r) => [`${assetName(r.a)} %`, (x: Fund) => (x.alloc ? share(x.alloc, r.a) : null)] as const),
      ...cols.map((c) => [c.fmt === pct ? `${c.head} %` : c.head, (x: Fund) => x[c.key] as number | null] as const),
    ];
    const headers = ["Kod", "Fon", "Tür", "Kurucu", "Durum", "Fiyat", "Büyüklük (₺)", "Yatırımcı", ...extra.map(([h]) => h)];
    const data = rows.map((x) => [x.code, x.name, x.type, x.founder, x.active ? "aktif" : "pasif", x.price || null, x.size, x.investors, ...extra.map(([, get]) => get(x))]);
    download(`fonlar-${location.pathname.split("/").pop()}-${VIEWS[view].name.toLocaleLowerCase("tr")}-${today()}.csv`, toCsv(headers, data));
  };
  const addRule = () => {
    if (!draft.a) return;
    const r: AssetRule = { a: draft.a, op: draft.op, min: draft.op === "has" ? Math.max(0, Number(draft.min) || 0) : 0 };
    set({ assets: [...f.assets.filter((x) => x.a !== r.a), r] }); // aynı varlığa ikinci kural öncekinin yerine geçer
    setDraft({ a: "", op: draft.op, min: "" });
  };
  const th = (key: SortKey, head: string, right = true) => (
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
        {active && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>Temizle</Button>}
        <Button size="sm" variant="ghost" onClick={copyLink} title="Filtre, görünüm ve sıralamayla bu listenin bağlantısı">{copied ? "Kopyalandı" : "Linki kopyala"}</Button>
        {picked.length > 0 && (
          <Button className="ml-auto" onClick={() => (location.href = `/karsilastir?codes=${picked.join(",")}`)}>Karşılaştır ({picked.length})</Button>
        )}
      </div>

      {/* Tüm Filtreler */}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Tüm Filtreler{panelOn > 0 && <Badge className="ml-2">{panelOn}</Badge>}</summary>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><div className="text-muted-foreground">Risk değeri (1–7, tahmini)</div>
            <div className="flex items-center gap-2">{riskSel("riskMin", "Min")}–{riskSel("riskMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Yatırımcı sayısı</div>
            <div className="flex items-center gap-2">{num("invMin", "Min")}–{num("invMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">Fon büyüklüğü (mn ₺)</div>
            <div className="flex items-center gap-2">{num("sizeMin", "Min")}–{num("sizeMax", "Maks")}</div></div>
          <div className="space-y-1"><div className="text-muted-foreground">TEFAS hisse ağırlığı en az (%)</div>{num("stockMin", "Örn. 50")}</div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-4">
            <div className="text-muted-foreground">Varlık içeriği <span className="text-xs">(portföyünde şu varlık olan / olmayan fonlar; birden çok kural hepsi birlikte uygulanır)</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <Pick className="w-full sm:w-64" value={draft.a} onChange={(v) => setDraft({ ...draft, a: v })} all="Varlık seçin…" items={opts.assets} />
              <div className="flex rounded-md border p-0.5" role="group" aria-label="Kural">
                {([["has", "İçersin"], ["not", "İçermesin"]] as const).map(([op, name]) => (
                  <Button key={op} size="sm" variant={draft.op === op ? "default" : "ghost"} aria-pressed={draft.op === op} onClick={() => setDraft({ ...draft, op })}>{name}</Button>
                ))}
              </div>
              {draft.op === "has" && (
                <Input className="w-28" type="number" min={0} max={100} placeholder="en az %" value={draft.min}
                  onChange={(e) => setDraft({ ...draft, min: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addRule()} />
              )}
              <Button size="sm" variant={draft.a ? "default" : "outline"} disabled={!draft.a} onClick={addRule}>Kural ekle</Button>
            </div>
            {f.assets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {f.assets.map((r) => (
                  <Badge key={r.a} variant={r.op === "not" ? "destructive" : "secondary"} className="gap-1 pr-1">
                    {ruleText(r)}
                    <button type="button" className="rounded px-1 hover:bg-foreground/10" aria-label={`${ruleText(r)} kuralını kaldır`}
                      onClick={() => set({ assets: f.assets.filter((x) => x !== r) })}>×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Risk değeri son 1 yılın günlük getiri volatilitesinden hesaplanır (resmi değer değildir). Maks. düşüş: son 1 yılda zirveden dibe en büyük kayıp. Aktif: fonun TEFAS'ta son 7 gün içinde veri yayımlaması ve KAP'ta tasfiye duyurusu olmaması; pasif fonlarda (tasfiye/birleşme) getiri ve nakit akışı gösterilmez. Yönetim ücreti, stopaj ve TEFAS işlem açık/kapalı bilgisi TEFAS API'sinde yok.
        </p>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs className="max-w-full overflow-x-auto" value={view} onValueChange={(v) => setView(v as string)}>
          <TabsList>{Object.entries(VIEWS).map(([k, v]) => <TabsTrigger key={k} value={k}>{v.name}</TabsTrigger>)}</TabsList>
        </Tabs>
        {list.usd && view !== "buyukluk" && view !== "nakit" && (
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Getiri para birimi">
            {(["TL", "USD"] as const).map((c) => (
              <Button key={c} size="sm" variant={ccy === c ? "default" : "ghost"} aria-pressed={ccy === c} onClick={() => setCcy(c)}>{c === "TL" ? "TL getiri" : "USD bazında"}</Button>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv} disabled={!rows.length} title="Filtrelenmiş tüm satırlar, açık görünümün sütunlarıyla">CSV indir ({rows.length})</Button>
      </div>
      {ccy === "USD" && view !== "buyukluk" && view !== "nakit" && <p className="text-xs text-muted-foreground" data-testid="usd-not">Getiriler USD bazında: (1 + TL getiri) / (1 + USD/TRY getirisi) − 1. Dolar bazında kazandı mı sorusunun cevabı.</p>}

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
              <TableHead className="w-14" />
              {th("code", "Kod", false)}
              {th("name", "Fon", false)}
              {stockCol.length > 0 && <TableHead className="text-right whitespace-nowrap">{stockCol[0].head}</TableHead>}
              {assetCols.map((r) => th(`@${r.a}`, `${assetName(r.a)} %`))}
              {cols.map((c) => th(c.key, c.head))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((x) => (
              <TableRow key={x.code} className={`cursor-pointer ${pins.has(x.code) ? "bg-muted/50" : ""}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,a,button")) return; // onay kutusu, pin ve hücre bağlantıları kendi işini yapar (sağ tık / orta tık / yeni sekme)
                  if (e.metaKey || e.ctrlKey) window.open(`/fon/${x.code}`, "_blank");
                  else location.href = `/fon/${x.code}`;
                }}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <input type="checkbox" checked={picked.includes(x.code)} disabled={!picked.includes(x.code) && picked.length >= MAX_COMPARE}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, x.code] : picked.filter((c) => c !== x.code))} />
                    <PinToggle on={pins.has(x.code)} onClick={() => toggle(x.code)} />
                  </div>
                </TableCell>
                <TableCell className="font-medium"><a className="hover:underline" href={`/fon/${x.code}`}>{x.code}</a></TableCell>
                <TableCell className="max-w-xs" title={`${x.name}\n${x.founder}`}><a className="block truncate" href={`/fon/${x.code}`}>{x.name} <Badge variant="secondary" className="ml-1">{x.type}</Badge>{!x.active && <Badge variant="outline" className="ml-1 text-red-600">Pasif</Badge>}</a></TableCell>
                {stockCol.length > 0 && <TableCell className="text-right font-medium tabular-nums"><a className="block" href={`/fon/${x.code}`}>{byStock?.[x.code]?.toFixed(2)}%</a></TableCell>}
                {assetCols.map((r) => <TableCell key={r.a} className="text-right font-medium tabular-nums"><a className="block" href={`/fon/${x.code}`}>{x.alloc ? `${share(x.alloc, r.a).toFixed(2)}%` : "–"}</a></TableCell>)}
                {cols.map((c) => (
                  <TableCell key={c.key} className={`text-right tabular-nums ${c.color ? tone(x[c.key] as number) : ""}`}><a className="block" href={`/fon/${x.code}`}>{c.fmt(x[c.key])}</a></TableCell>
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
