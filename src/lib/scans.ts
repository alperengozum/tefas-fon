// Hazır taramalar: liste verisinden (Fund) önceden tanımlı filtre + sıralama; /tarama/{slug} sunucuda HTML olarak çizilir
// (taranabilir, paylaşılabilir). Yalnız aktif fonlar, değeri boş olan atılır.
export type ScanFund = {
  code: string; name: string; kind: string; type: string; active: boolean; fx: boolean; qualified: boolean;
  size: number; investors: number; risk: number | null; m1: number | null; m3: number | null; y1: number | null; flow_m1: number | null;
};
type Key = "y1" | "m3" | "m1" | "flow_m1" | "size";
export type Scan = {
  slug: string; title: string; description: string; kind: "YAT" | "EMK" | "BYF";
  filter: (f: ScanFund) => boolean; sort: Key; dir: 1 | -1; cols: Key[];
};

const MIN_SIZE = 10e6; // 10 mn ₺ altı fonlar sıralamayı bozmasın (yeni/çok küçük fonlarda getiri gürültülü)
const big = (f: ScanFund) => f.size >= MIN_SIZE;

export const SCANS: Scan[] = [
  { slug: "en-cok-kazandiran-hisse-fonlari", title: "Son 1 yılda en çok kazandıran hisse senedi fonları", description: "Hisse senedi fonları, 1 yıllık getiriye göre.", kind: "YAT", filter: (f) => f.type === "Hisse Senedi" && big(f), sort: "y1", dir: -1, cols: ["y1", "m3", "m1", "size"] },
  { slug: "dusuk-riskli-en-yuksek-getiri", title: "Düşük riskli (1-3) en yüksek getirili fonlar", description: "Tahmini risk değeri 3 ve altı fonlar, 1 yıllık getiriye göre.", kind: "YAT", filter: (f) => f.risk != null && f.risk <= 3 && big(f), sort: "y1", dir: -1, cols: ["y1", "m3", "m1", "size"] },
  { slug: "en-cok-para-girisi", title: "Son 1 ayda en çok para girişi olan fonlar", description: "Pay sayısı değişimi x fiyat ile tahmini 1 aylık net nakit girişi.", kind: "YAT", filter: (f) => f.flow_m1 != null && f.flow_m1 > 0, sort: "flow_m1", dir: -1, cols: ["flow_m1", "size", "m1", "y1"] },
  { slug: "en-cok-para-cikisi", title: "Son 1 ayda en çok para çıkışı olan fonlar", description: "Tahmini 1 aylık net nakit çıkışı en büyük fonlar.", kind: "YAT", filter: (f) => f.flow_m1 != null && f.flow_m1 < 0, sort: "flow_m1", dir: 1, cols: ["flow_m1", "size", "m1", "y1"] },
  { slug: "en-buyuk-fonlar", title: "En büyük yatırım fonları", description: "Portföy büyüklüğüne göre en büyük yatırım fonları.", kind: "YAT", filter: () => true, sort: "size", dir: -1, cols: ["size", "y1", "m1", "flow_m1"] },
  { slug: "altin-fonlari", title: "Altın ve kıymetli maden fonları", description: "Kıymetli maden fonları, 1 yıllık getiriye göre.", kind: "YAT", filter: (f) => f.type === "Kıymetli Maden" && big(f), sort: "y1", dir: -1, cols: ["y1", "m3", "m1", "size"] },
  { slug: "doviz-fonlari", title: "Döviz cinsi fonlar", description: "Adında döviz geçen fonlar, 1 yıllık getiriye göre.", kind: "YAT", filter: (f) => f.fx && big(f), sort: "y1", dir: -1, cols: ["y1", "m3", "m1", "size"] },
  { slug: "en-cok-kazandiran-bes-fonlari", title: "Son 1 yılda en çok kazandıran BES fonları", description: "Emeklilik (BES) fonları, 1 yıllık getiriye göre.", kind: "EMK", filter: big, sort: "y1", dir: -1, cols: ["y1", "m3", "m1", "size"] },
];

export const COLS: Record<Key, string> = { y1: "1Y getiri", m3: "3A getiri", m1: "1A getiri", flow_m1: "1A net giriş", size: "Büyüklük" };

export function runScan<T extends ScanFund>(s: Scan, funds: T[], limit = 50): T[] {
  return funds
    .filter((f) => f.active && f[s.sort] != null && s.filter(f))
    .sort((a, b) => ((a[s.sort] as number) - (b[s.sort] as number)) * s.dir)
    .slice(0, limit);
}
