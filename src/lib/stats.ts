// Saf hesaplar (DB/Astro bağımsız): korelasyon, beta, hisse örtüşmesi, SIP/tek seferlik simülasyon, kayan getiri.
export type Pt = { date: string; price: number };
export type Hold = { ticker: string; weight: number };

const MIN_N = 20; // korelasyon/beta için en az ortak gün

// date -> günlük getiri (oran); yalnız `since` ve sonrası
export function dailyReturns(h: Pt[], since: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 1; i < h.length; i++) if (h[i].date >= since && h[i - 1].price > 0 && h[i].price > 0) m.set(h[i].date, h[i].price / h[i - 1].price - 1);
  return m;
}

function pairs(a: Map<string, number>, b: Map<string, number>): [number[], number[]] {
  const x: number[] = [], y: number[] = [];
  for (const [d, v] of a) { const w = b.get(d); if (w !== undefined) { x.push(v); y.push(w); } }
  return [x, y];
}
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
function cov(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y);
  return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (x.length - 1);
}

export function corr(a: Map<string, number>, b: Map<string, number>): number | null {
  const [x, y] = pairs(a, b);
  if (x.length < MIN_N) return null;
  const d = Math.sqrt(cov(x, x) * cov(y, y));
  return d > 0 ? cov(x, y) / d : null;
}

// f'nin b'ye (benchmark) betası
export function beta(f: Map<string, number>, b: Map<string, number>): number | null {
  const [x, y] = pairs(f, b);
  if (x.length < MIN_N) return null;
  const v = cov(y, y);
  return v > 0 ? cov(x, y) / v : null;
}

// İki fonun ortak hisse ağırlığı: Σ min(wA, wB) (portföy değerine %). 0-100 arası.
export function overlap(a: Hold[], b: Hold[]): number {
  const m = new Map(b.map((h) => [h.ticker, h.weight]));
  return a.reduce((s, h) => s + Math.min(h.weight, m.get(h.ticker) ?? 0), 0);
}

const day = (s: string) => Date.parse(s + "T00:00:00Z") / 864e5;
const iso = (t: number) => new Date(t * 864e5).toISOString().slice(0, 10);
const firstGE = (h: Pt[], d: string) => h.find((r) => r.date >= d);
const lastLE = (h: Pt[], d: string) => { for (let i = h.length - 1; i >= 0; i--) if (h[i].date <= d) return h[i]; };
const GAP = 7; // hedef güne en fazla bu kadar gün uzaktaki işlem günü kabul (seyrek çapa haftaları ve veri boşlukları elenir)

// Yıllıklandırılmış iç verim (XIRR), bisection. Akışlar [tarih, tutar] (yatırım -, değer +).
export function xirr(flows: [string, number][]): number | null {
  const t0 = day(flows[0][0]);
  const npv = (r: number) => flows.reduce((s, [d, a]) => s + a / (1 + r) ** ((day(d) - t0) / 365), 0);
  let lo = -0.99, hi = 100;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; npv(lo) * npv(m) <= 0 ? (hi = m) : (lo = m); }
  return (lo + hi) / 2;
}

export type Sim = {
  n: number; first: string; last: string; invested: number; value: number; ret: number; xirr: number | null; // SIP
  lump: number; lumpAnn: number | null; // tek seferlik: başlangıçtaki fiyattan bitişe getiri %
};

// start'tan itibaren her ay aynı gün (yoksa sonraki işlem günü) `monthly` TL alım; end'deki fiyatla değerle.
export function simulate(h: Pt[], monthly: number, start: string, end: string): Sim | null {
  const endRow = lastLE(h, end);
  if (!endRow?.price) return null; // 0 = fiyat açıklanmadı
  const s = day(start), d0 = new Date(start + "T00:00:00Z");
  const flows: [string, number][] = [];
  let units = 0;
  for (let k = 0; ; k++) {
    const dim = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k + 1, 0)).getUTCDate();
    const want = iso(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, Math.min(d0.getUTCDate(), dim)) / 864e5);
    if (want > endRow.date) break;
    const row = firstGE(h, want);
    if (!row || row.date > endRow.date) break;
    if (day(row.date) - day(want) > GAP || !row.price) continue;
    units += monthly / row.price;
    flows.push([row.date, -monthly]);
  }
  const first = firstGE(h, iso(s));
  if (!flows.length || !first?.price || first.date >= endRow.date || day(first.date) - s > GAP) return null;
  const value = units * endRow.price, invested = monthly * flows.length;
  const days = day(endRow.date) - day(first.date);
  const lump = (endRow.price / first.price - 1) * 100;
  return {
    n: flows.length, first: flows[0][0], last: endRow.date, invested, value, ret: (value / invested - 1) * 100,
    xirr: days >= 90 ? xirr([...flows, [endRow.date, value]]) : null,
    lump, lumpAnn: days >= 365 ? ((endRow.price / first.price) ** (365 / days) - 1) * 100 : null,
  };
}

// Kayan `days` günlük getiri dağılımı (%): her işlem günü için `days` gün öncesine göre.
export function rolling(h: Pt[], days: number) {
  const r: number[] = [];
  for (const e of h) {
    const want = iso(day(e.date) - days), s = lastLE(h, want);
    if (s && day(want) - day(s.date) <= GAP && s.price > 0 && e.price > 0) r.push((e.price / s.price - 1) * 100);
  }
  if (r.length < 20) return null;
  r.sort((a, b) => a - b);
  return { n: r.length, min: r[0], median: r[r.length >> 1], max: r[r.length - 1], pos: (r.filter((x) => x > 0).length / r.length) * 100 };
}

const lastPriced = (h: Pt[], d: string) => { for (let i = h.length - 1; i >= 0; i--) if (h[i].date <= d && h[i].price > 0) return h[i]; };
// d gününde (en çok GAP gün geriden) açıklanmış son fiyat; yoksa (veri boşluğu) undefined
const refAt = (h: Pt[], d: string) => { const r = lastPriced(h, d); return r && day(d) - day(r.date) <= GAP ? r : undefined; };

export type Drawdown = { max: number; peak: string; trough: string; recovered: string | null; recovery: number | null };

// En büyük düşüş (max drawdown): `since` sonrası zirveden dibe en büyük kayıp % (≤ 0), zirve/dip günleri,
// zirve seviyesine geri dönülen gün ve dipten oraya kaç gün sürdüğü (henüz dönülmediyse null). Fiyat 0 günleri atlanır.
export function drawdown(h: Pt[], since = ""): Drawdown | null {
  const p = h.filter((r) => r.date >= since && r.price > 0);
  if (p.length < 2) return null;
  let peak = p[0], best: Drawdown = { max: 0, peak: p[0].date, trough: p[0].date, recovered: null, recovery: null }, bestPeak = p[0].price;
  for (const r of p) {
    if (r.price > peak.price) peak = r;
    const dd = (r.price / peak.price - 1) * 100;
    if (dd < best.max) { best = { max: dd, peak: peak.date, trough: r.date, recovered: null, recovery: null }; bestPeak = peak.price; }
  }
  const back = best.max < 0 ? p.find((r) => r.date > best.trough && r.price >= bestPeak) : undefined;
  if (back) { best.recovered = back.date; best.recovery = day(back.date) - day(best.trough); }
  return best;
}

// Yıllıklandırılmış Sharpe ve Sortino (günlük getiriler, `rf`: yıllık risksiz getiri oranı, ör. 0.45).
// Sortino paydası yalnız risksiz getirinin altındaki günlerin sapması. Az veri veya sıfır oynaklıkta null.
export function ratios(daily: Map<string, number>, rf: number): { sharpe: number | null; sortino: number | null } {
  const r = [...daily.values()];
  if (r.length < MIN_N) return { sharpe: null, sortino: null };
  const rfd = (1 + rf) ** (1 / 252) - 1, ex = r.map((x) => x - rfd), m = mean(ex);
  const sd = Math.sqrt(cov(r, r)), down = Math.sqrt(ex.reduce((s, x) => s + Math.min(0, x) ** 2, 0) / ex.length);
  return { sharpe: sd > 1e-12 ? (m / sd) * Math.sqrt(252) : null, sortino: down > 1e-12 ? (m / down) * Math.sqrt(252) : null };
}

// Yıllık volatilite %: günlük getiri örneklem sapması x √252 (ingest'teki fund_vol ile aynı tanım)
export function annualVol(daily: Map<string, number>): number | null {
  const r = [...daily.values()];
  return r.length < MIN_N ? null : Math.sqrt(cov(r, r) * 252) * 100;
}

export const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

// Kategori içi sıra: `v` değeri `all` (kendisi dahil, null'lar atılır) içinde kaçıncı (1 = en yüksek) ve ilk yüzde kaçta
export function rank(v: number | null | undefined, all: (number | null | undefined)[]): { rank: number; n: number; top: number } | null {
  const xs = all.filter((x): x is number => x != null && isFinite(x));
  if (v == null || !isFinite(v) || xs.length < 2) return null;
  const r = xs.filter((x) => x > v).length + 1;
  return { rank: r, n: xs.length, top: Math.max(1, Math.round((r / xs.length) * 100)) };
}

export type CalRow = { year: number; months: (number | null)[]; total: number | null };

// Takvim getirileri: her yıl için 12 aylık getiri (ay sonu / önceki ay sonu) ve yıllık getiri (yıl sonu / önceki yıl sonu).
// Ay/yıl sonu fiyatı en çok GAP gün geriden alınır; içinde bulunulan dönem son fiyatla biter. Veri boşluğu olan hücre null.
export function calendar(h: Pt[]): CalRow[] {
  const p = h.filter((r) => r.price > 0);
  if (p.length < 2) return [];
  const last = p[p.length - 1].date, eom = (y: number, m: number) => iso(Date.UTC(y, m + 1, 0) / 864e5);
  const chg = (a: string, b: string) => {
    const s = refAt(p, a), e = refAt(p, b < last ? b : last);
    return s && e && e.date > s.date ? (e.price / s.price - 1) * 100 : null;
  };
  const rows: CalRow[] = [];
  for (let y = +p[0].date.slice(0, 4); y <= +last.slice(0, 4); y++) {
    const months = Array.from({ length: 12 }, (_, m) => (iso(Date.UTC(y, m, 1) / 864e5) > last ? null : chg(eom(y, m - 1), eom(y, m))));
    const total = chg(`${y - 1}-12-31`, `${y}-12-31`);
    if (total != null || months.some((x) => x != null)) rows.push({ year: y, months, total });
  }
  return rows.reverse(); // en yeni yıl üstte
}
