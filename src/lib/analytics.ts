// `days` gün önceki (ytd: yıl başından önceki) son fiyata göre getiri %
export function ret(h: { date: string; price: number }[], days: number | "ytd"): number | null {
  const last = h[h.length - 1];
  if (!last) return null;
  const cut = days === "ytd"
    ? new Date(new Date(last.date.slice(0, 4) + "-01-01").getTime() - 864e5)
    : new Date(new Date(last.date).getTime() - days * 864e5);
  const c = cut.toISOString().slice(0, 10);
  const old = [...h].reverse().find((r) => r.date <= c && r.price > 0);
  return old?.price && last.price ? (last.price / old.price - 1) * 100 : null;
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
