// BYF prim/iskonto: borsa bülten fiyatı / NAV (fon birim fiyatı) - 1, %. TEFAS ikisini aynı satırda (aynı gün) verir, tarih kaydırma gerekmez.
// Pozitif = borsada NAV'ın üstünde (primli) işlem görüyor: alıcı fazla öder. Negatif = iskontolu.
export type PremRow = { date: string; price: number; bprice?: number | null };
export type PremPt = { date: string; prem: number };

export function premiums(h: PremRow[], since = ""): PremPt[] {
  return h.filter((r) => r.date >= since && r.bprice != null && r.bprice > 0 && r.price > 0)
    .map((r) => ({ date: r.date, prem: (r.bprice! / r.price - 1) * 100 }));
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const daysBefore = (d: string, n: number) => new Date(new Date(d).getTime() - n * 864e5).toISOString().slice(0, 10);

export type PremStats = {
  last: { date: string; nav: number; bprice: number; prem: number };
  avg30: number | null; avg1y: number | null; absAvg1y: number | null; // absAvg1y: NAV'dan ortalama sapma (yön bağımsız)
  min: PremPt; max: PremPt; n: number;
};

// Son 1 yıl (son veriye göre). Bülten fiyatı hiç yoksa ya da son değer 7 günden eskiyse null (bayat veri gösterilmesin).
export function premiumStats(h: PremRow[]): PremStats | null {
  const lastDate = h[h.length - 1]?.date;
  if (!lastDate) return null;
  const s = premiums(h, daysBefore(lastDate, 365));
  const end = s[s.length - 1];
  if (!end || end.date < daysBefore(lastDate, 7)) return null;
  const row = h.find((r) => r.date === end.date)!;
  const v = s.map((p) => p.prem);
  return {
    last: { date: end.date, nav: row.price, bprice: row.bprice!, prem: end.prem },
    avg30: mean(s.filter((p) => p.date >= daysBefore(end.date, 30)).map((p) => p.prem)),
    avg1y: mean(v), absAvg1y: mean(v.map(Math.abs)),
    min: s.reduce((a, b) => (b.prem < a.prem ? b : a)), max: s.reduce((a, b) => (b.prem > a.prem ? b : a)), n: s.length,
  };
}
