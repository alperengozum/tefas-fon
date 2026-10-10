// `days` gün önceki (ytd: yıl başından önceki) son fiyata göre getiri %
export function ret(h: { date: string; price: number }[], days: number | "ytd"): number | null {
  const last = h[h.length - 1];
  if (!last) return null;
  const cut = days === "ytd"
    ? new Date(new Date(last.date.slice(0, 4) + "-01-01").getTime() - 864e5)
    : new Date(new Date(last.date).getTime() - days * 864e5);
  const c = cut.toISOString().slice(0, 10), floor = new Date(cut.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  // db.ts listesiyle aynı: vade gününden en çok 7 gün geriye bak (ACTIVE_DAYS), yoksa uzak/bozuk bir fiyatla kıyaslanır
  const old = [...h].reverse().find((r) => r.date <= c && r.price > 0);
  if (!old || old.date <= floor) return null;
  return last.price ? (last.price / old.price - 1) * 100 : null;
}

// Grafikler en çok 1 yıl gösterir: istemciye yalnız son ~1 yıl ve gereken alanlar gider
// (Astro her prop değerini [0,v] ile sarıyor; tam geçmiş fon sayfasını ~100KB -> ~500KB şişiriyordu).
export function forChart<T extends { date: string }, K extends keyof T>(h: T[], keys: K[]): Pick<T, K | "date">[] {
  const cut = new Date(Date.now() - 370 * 864e5).toISOString().slice(0, 10);
  // fiyat 0 = açıklanmadı: null, grafikte düşüş gibi görünmesin
  return h.filter((r) => r.date >= cut).map((r) => Object.fromEntries([...keys, "date" as keyof T].map((k) => [k, k === "price" && r[k] === 0 ? null : r[k]])) as Pick<T, K | "date">);
}

export const RETURNS: [string, number | "ytd"][] = [["1H", 7], ["1A", 30], ["3A", 91], ["6A", 182], ["YBB", "ytd"], ["1Y", 365], ["2Y", 730], ["3Y", 1095], ["5Y", 1825]];

// Benchmark seri kodları (bench tablosundaki sym) ve görünen adları
export const BENCH: [string, string][] = [["BIST100", "BIST 100"], ["USD", "USD/TRY"], ["ALTIN", "Gram altın"]];

// Getiriyi başka bir varlık cinsinden ifade et (%): TL getirisi r, USD/TRY getirisi b -> USD bazında (1+r)/(1+b) - 1
export const inBase = (r: number | null | undefined, b: number | null | undefined) =>
  r == null || b == null || !isFinite(r) || !isFinite(b) ? null : ((1 + r / 100) / (1 + b / 100) - 1) * 100;

// Liste getiri anahtarı -> gün (db.ts PERIODS ile aynı vadeler; ytd ayrı)
export const PERIOD_DAYS: [string, number | "ytd"][] = [["d1", 1], ["w1", 7], ["m1", 30], ["m3", 91], ["m6", 182], ["ytd", "ytd"], ["y1", 365], ["y2", 730], ["y3", 1095], ["y5", 1825]];
