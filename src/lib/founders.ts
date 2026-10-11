// Kurucu (portföy yönetim şirketi / emeklilik şirketi) bazında özet: aktif fonlardan toplam büyüklük, yatırımcı, getiri, nakit akışı.
export type FounderFund = {
  code: string; name: string; founder: string; type: string; active: boolean;
  size: number; investors: number; y1: number | null; m1: number | null; flow_m1: number | null;
};
export type FounderStats = {
  founder: string; slug: string; count: number; size: number; investors: number;
  y1: number | null; // büyüklük ağırlıklı 1Y getiri (% , 1Y verisi olan fonlar)
  y1Median: number | null; flow_m1: number; // 1 aylık net nakit akışı toplamı (₺)
  types: { type: string; count: number; size: number; y1: number | null }[];
};

// "AK PORTFÖY" -> "ak-portfoy" (Türkçe harfler sadeleşir, adres güvenli)
export const slug = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const weighted = (fs: FounderFund[]) => {
  const w = fs.filter((f) => f.y1 != null && f.size > 0), s = w.reduce((a, f) => a + f.size, 0);
  return s > 0 ? w.reduce((a, f) => a + f.y1! * f.size, 0) / s : null;
};
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

export function aggregate(funds: FounderFund[]): FounderStats[] {
  const by = new Map<string, FounderFund[]>();
  for (const f of funds) if (f.active && f.founder) (by.get(f.founder) ?? by.set(f.founder, []).get(f.founder)!).push(f);
  return [...by].map(([founder, fs]) => {
    const t = new Map<string, FounderFund[]>();
    for (const f of fs) (t.get(f.type) ?? t.set(f.type, []).get(f.type)!).push(f);
    return {
      founder, slug: slug(founder), count: fs.length,
      size: fs.reduce((a, f) => a + (f.size || 0), 0), investors: fs.reduce((a, f) => a + (f.investors || 0), 0),
      y1: weighted(fs), y1Median: median(fs.flatMap((f) => (f.y1 == null ? [] : [f.y1]))),
      flow_m1: fs.reduce((a, f) => a + (f.flow_m1 ?? 0), 0),
      types: [...t].map(([type, g]) => ({ type, count: g.length, size: g.reduce((a, f) => a + (f.size || 0), 0), y1: weighted(g) })).sort((a, b) => b.size - a.size),
    };
  }).sort((a, b) => b.size - a.size);
}
