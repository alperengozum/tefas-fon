// Hisse sepeti vs fon: KAP raporundaki hisse ağırlıkları dönem boyunca hiç değişmeseydi sepet ne getirirdi, fona katkısı ne olurdu,
// fonun gerçek getirisi bundan ne kadar ayrıştı? Fark = hisse dışı varlıklar (repo, tahvil, mevduat) + dönem içi alım-satım + giderler.
// Tarihler TEFAS etiketinde: D tarihli fon fiyatı D'den önceki işlem gününün kapanışıdır (bkz. db.getBench); hisse kapanışları da
// shiftNext ile bir sonraki işlem gününe etiketlenir, böylece fon, hisse ve endeks aynı günün kapanışıyla kıyaslanır.
export type Px = { date: string; price: number };
export type Weight = { ticker: string; weight: number }; // weight: fon toplam değerine %

// Her kapanışı serinin bir sonraki gününün tarihiyle etiketle; en son kapanışın karşılığı yok, atılır (getBench ile aynı)
export const shiftNext = (h: Px[]): Px[] => h.slice(0, -1).map((r, i) => ({ date: h[i + 1].date, price: r.price }));

const MAX_GAP = 7; // gün: bu kadar eski fiyat "o günün fiyatı" sayılmaz (işlem görmeyen/kotasyondan çıkan hisse)
const back = (d: string, n: number) => new Date(new Date(d).getTime() - n * 864e5).toISOString().slice(0, 10);
export function at(h: Px[], d: string): number | null {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].date <= d) return h[i].date > back(d, MAX_GAP) && h[i].price > 0 ? h[i].price : null;
  return null;
}

export type AttrRow = { ticker: string; weight: number; ret: number; contrib: number }; // ret %, contrib: fona katkı (yüzde puan)
export type Attr = {
  start: string; end: string; days: number;
  fund: number; basket: number; contrib: number; rest: number; bench: number | null; // % (rest = fon - katkı)
  stockWeight: number; covered: number; // rapordaki toplam hisse ağırlığı ve fiyatı bulunanların ağırlığı (%)
  rows: AttrRow[];
};

// period: rapor dönem sonu (ağırlıkların günü). until: dönemin bittiği TEFAS günü (açık dönemde fonun son günü).
// Fiyatı bulunan hisseler raporun ağırlığının yarısından azsa ya da dönem 5 günden kısaysa null.
export function attribution(o: { weights: Weight[]; period: string; until: string; fund: Px[]; stocks: Record<string, Px[]>; bench?: Px[] | null }): Attr | null {
  const startPt = o.fund.find((r) => r.date > o.period && r.price > 0);
  const endPt = [...o.fund].reverse().find((r) => r.date <= o.until && r.price > 0);
  if (!startPt || !endPt || endPt.date <= startPt.date) return null;
  const days = Math.round((new Date(endPt.date).getTime() - new Date(startPt.date).getTime()) / 864e5);
  if (days < 5) return null;
  const rows: AttrRow[] = [];
  let stockWeight = 0;
  for (const w of o.weights) {
    if (!(w.weight > 0)) continue;
    stockWeight += w.weight;
    const h = o.stocks[w.ticker];
    const a = h && at(h, startPt.date), b = h && at(h, endPt.date);
    if (!a || !b) continue;
    const ret = (b / a - 1) * 100;
    rows.push({ ticker: w.ticker, weight: w.weight, ret, contrib: (w.weight * ret) / 100 });
  }
  const covered = rows.reduce((s, r) => s + r.weight, 0);
  if (!stockWeight || covered < stockWeight / 2) return null;
  const contrib = rows.reduce((s, r) => s + r.contrib, 0);
  const fund = (endPt.price / startPt.price - 1) * 100;
  const b0 = o.bench && at(o.bench, startPt.date), b1 = o.bench && at(o.bench, endPt.date);
  return {
    start: startPt.date, end: endPt.date, days,
    fund, basket: (contrib / covered) * 100, contrib, rest: fund - contrib, bench: b0 && b1 ? (b1 / b0 - 1) * 100 : null,
    stockWeight, covered, rows: rows.sort((x, y) => Math.abs(y.contrib) - Math.abs(x.contrib)),
  };
}
