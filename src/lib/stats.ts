// Saf hesaplar (DB/Astro bağımsız): korelasyon, beta, hisse örtüşmesi, SIP/tek seferlik simülasyon, kayan getiri.
export type Pt = { date: string; price: number };
export type Hold = { ticker: string; weight: number };

const MIN_N = 20; // korelasyon/beta için en az ortak gün

// date -> günlük getiri (oran); yalnız `since` ve sonrası
export function dailyReturns(h: Pt[], since: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 1; i < h.length; i++) if (h[i].date >= since && h[i - 1].price > 0) m.set(h[i].date, h[i].price / h[i - 1].price - 1);
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
  if (!endRow) return null;
  const s = day(start), d0 = new Date(start + "T00:00:00Z");
  const flows: [string, number][] = [];
  let units = 0;
  for (let k = 0; ; k++) {
    const dim = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k + 1, 0)).getUTCDate();
    const want = iso(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, Math.min(d0.getUTCDate(), dim)) / 864e5);
    if (want > endRow.date) break;
    const row = firstGE(h, want);
    if (!row || row.date > endRow.date) break;
    if (day(row.date) - day(want) > GAP) continue;
    units += monthly / row.price;
    flows.push([row.date, -monthly]);
  }
  const first = firstGE(h, iso(s));
  if (!flows.length || !first || first.date >= endRow.date || day(first.date) - s > GAP) return null;
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
    if (s && day(want) - day(s.date) <= GAP && s.price > 0) r.push((e.price / s.price - 1) * 100);
  }
  if (r.length < 20) return null;
  r.sort((a, b) => a - b);
  return { n: r.length, min: r[0], median: r[r.length >> 1], max: r[r.length - 1], pos: (r.filter((x) => x > 0).length / r.length) * 100 };
}
