// BES (bireysel emeklilik) simülasyonu: aylık katkı + devlet katkısı (DK) + hak ediş. Saf hesap, DB/Astro bağımsız.
// Kurallar (Allianz/QNB Sigorta 2026 rehberleri; 7 Ocak 2026 tarihli Cumhurbaşkanı Kararı):
// - DK oranı: katkı payının %30'u; 1 Ocak 2026 ve sonrası ödenen katkılarda %20 (2022 öncesi %25)
// - Yıllık DK üst sınırı: o yılın brüt asgari ücret toplamının aynı oranı (2025: %30 -> 93.619,80 TL; 2026: %20 -> 79.272 TL)
// - Hak ediş (DK'nın çekilebilen kısmı): 3 yıl %15, 6 yıl %35, 10 yıl %60, 10 yıl + 56 yaş %100
// DK katılımcının fonuna değil, şirketin devlet katkısı fonlarına yatırılır.
export type Pt = { date: string; price: number };

export const DK_RULES = [
  { from: "0000-01-01", rate: 0.25, cap: 0.25 },
  { from: "2022-01-01", rate: 0.3, cap: 0.3 },
  { from: "2026-01-01", rate: 0.2, cap: 0.2 },
];
// Yıllık brüt asgari ücret toplamı (₺). 2023: Ocak 10.008, Temmuz 13.414,50; 2024: 20.002,50; 2025: 26.005,50; 2026: 33.030 (aylık)
export const MIN_WAGE_YEAR: Record<number, number> = { 2023: 6 * 10008 + 6 * 13414.5, 2024: 12 * 20002.5, 2025: 12 * 26005.5, 2026: 12 * 33030 };

export const dkRule = (d: string) => DK_RULES.reduce((m, r) => (r.from <= d ? r : m), DK_RULES[0]);

// Sistemde geçen süre (yıl) ve bitişteki yaşa göre DK hak ediş oranı
export function vesting(years: number, age?: number | null): number {
  if (years >= 10 && age != null && age >= 56) return 1;
  return years >= 10 ? 0.6 : years >= 6 ? 0.35 : years >= 3 ? 0.15 : 0;
}

const day = (s: string) => Date.parse(s + "T00:00:00Z") / 864e5;
const iso = (t: number) => new Date(t * 864e5).toISOString().slice(0, 10);
const GAP = 7;
const firstGE = (h: Pt[], d: string) => h.find((r) => r.date >= d);
const lastLE = (h: Pt[], d: string) => { for (let i = h.length - 1; i >= 0; i--) if (h[i].date <= d && h[i].price > 0) return h[i]; };

export type BesYear = { year: number; paid: number; dk: number; cap: number | null };
export type BesResult = {
  n: number; first: string; last: string; years: number;
  invested: number; value: number; // katılımcı katkıları ve bitiş değeri
  dkPaid: number; dkValue: number; vest: number; dkVested: number; // DK: yatırılan, değeri, hak ediş oranı, çekilebilir
  total: number; ret: number; xirr: number | null; // çekilebilir toplam (katkı değeri + hak edilen DK), getiri %, yıllık iç verim
  dkCash: boolean; capUnknown: number[]; // DK fonunda fiyat bulunamayan alım oldu mu (nakit kaldı); tavanı bilinmeyen yıllar
  byYear: BesYear[];
};

// start'tan itibaren her ay aynı gün (yoksa sonraki işlem günü) `monthly` ₺ katkı; DK aynı gün DK fonuna. end'deki fiyatlarla değerlenir.
export function simulateBes(fund: Pt[], dkFund: Pt[], monthly: number, start: string, end: string, age: number | null, xirr: (f: [string, number][]) => number | null): BesResult | null {
  const endRow = lastLE(fund, end);
  if (!endRow) return null;
  const d0 = new Date(start + "T00:00:00Z"), flows: [string, number][] = [], years = new Map<number, BesYear>();
  let units = 0, dkUnits = 0, dkCashAmt = 0, dkCash = false;
  for (let k = 0; ; k++) {
    const dim = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k + 1, 0)).getUTCDate();
    const want = iso(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, Math.min(d0.getUTCDate(), dim)) / 864e5);
    if (want > endRow.date) break;
    const row = firstGE(fund, want);
    if (!row || row.date > endRow.date) break;
    if (day(row.date) - day(want) > GAP || !row.price) continue;
    units += monthly / row.price;
    flows.push([row.date, -monthly]);
    const y = +row.date.slice(0, 4), r = dkRule(row.date), wage = MIN_WAGE_YEAR[y];
    const yr = years.get(y) ?? years.set(y, { year: y, paid: 0, dk: 0, cap: wage ? r.cap * wage : null }).get(y)!;
    yr.paid += monthly;
    const dk = Math.max(0, Math.min(r.rate * monthly, yr.cap == null ? Infinity : yr.cap - yr.dk));
    yr.dk += dk;
    const dr = firstGE(dkFund, row.date);
    if (dr && dr.price > 0 && day(dr.date) - day(row.date) <= GAP) dkUnits += dk / dr.price;
    else if (dk > 0) { dkCashAmt += dk; dkCash = true; }
  }
  if (!flows.length) return null;
  const dkEnd = lastLE(dkFund, end);
  const value = units * endRow.price, dkValue = dkUnits * (dkEnd?.price ?? 0) + dkCashAmt;
  const first = flows[0][0], yrs = (day(endRow.date) - day(first)) / 365.25;
  const vest = vesting(yrs, age == null ? null : age + yrs);
  const invested = monthly * flows.length, dkPaid = [...years.values()].reduce((s, y) => s + y.dk, 0), total = value + dkValue * vest;
  return {
    n: flows.length, first, last: endRow.date, years: yrs, invested, value, dkPaid, dkValue, vest, dkVested: dkValue * vest, total,
    ret: (total / invested - 1) * 100, xirr: day(endRow.date) - day(first) >= 90 ? xirr([...flows, [endRow.date, total]]) : null,
    dkCash, capUnknown: [...years.values()].filter((y) => y.cap == null).map((y) => y.year), byYear: [...years.values()],
  };
}
