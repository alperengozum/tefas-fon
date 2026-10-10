// Portföy ve vergi hesapları (saf, DB/Astro bağımsız): stopaj, stopaj sonrası net getiri, yeniden dengeleme, portföy riski.
import { ruleAt, STOPAJ_RULES } from "./stopaj-rules.mjs";

type StopajRule = (typeof STOPAJ_RULES)[number];

const day = (s: string) => Date.parse(s + "T00:00:00Z") / 864e5;

// Stopaj oranı: alış tarihine göre src/lib/stopaj-rules.mjs tablosundan (yeni karar = yeni satır, mantık değişmez).
// - BES (EMK): fon düzeyinde stopaj yok (emeklilik kesintisi ayrı) -> null
// - hisse senedi yoğun %0 (TEFAS dışı serbest hisse yoğunlarda kuralın serbestHisseYogun oranı)
// - portföyün ≥ %51'i BIST hissesi ve 1 yıldan uzun tutulmuş: %0 (ponytail: "sürekli" şartı güncel dağılımla yaklaşıklanır)
// - GYF/GSYF: 2 yıldan uzun %0, değilse b grubu
// - değişken/karma/eurobond/dış borçlanma/yabancı/serbest/döviz: a grubu; diğerleri b grubu
// kind: TEFAS türü, stockFocus: classify() çıktısı (adında "HİSSE SENEDİ YOĞUN"), stock: BIST hisse oranı % (TEFAS hs).
// Gruplar addan bakılır: classify tür sırasında "Hisse Senedi" önce geldiği için serbest hisse yoğunlar "Hisse Senedi" türünde.
export type TaxFund = { kind: string; name: string; stockFocus: boolean; stock: number };
const up = (s: string) => s.toLocaleUpperCase("tr").replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ö/g, "O").replace(/Ü/g, "U").replace(/Ç/g, "C");
const GROUP_A = /DEGISKEN|KARMA|EUROBOND|DIS BORCLANMA|YABANCI|SERBEST|DOVIZ/;
// rules: koddaki tablo + otomatik eklenenler (db.getStopajRules); verilmezse koddaki tablo
export function stopajRate(f: TaxFund, buy: string, sell: string, rules: StopajRule[] = STOPAJ_RULES): number | null {
  if (f.kind === "EMK") return null;
  const r = ruleAt(buy, rules), held = day(sell) - day(buy), name = up(f.name);
  if (f.stockFocus) return /SERBEST/.test(name) ? (r.serbestHisseYogun ?? 0) : 0;
  if (f.stock >= 51 && held > 365) return 0;
  if (f.kind === "GYF" || f.kind === "GSYF") return held > 730 ? 0 : r.b;
  return GROUP_A.test(name) ? r.a : r.b;
}

export type Lot = { date: string; units: number; cost: number };

// Lot bazında stopaj: her alımın kazancı (zararlı lot vergilenmez) kendi elde tutma süresinin oranıyla. BES: vergi 0.
export function afterTax(f: TaxFund, lots: Lot[], price: number, sell: string, rules: StopajRule[] = STOPAJ_RULES): { gross: number; tax: number; net: number } {
  let gross = 0, tax = 0;
  for (const l of lots) {
    const v = l.units * price, gain = v - l.cost;
    gross += v;
    if (gain > 0) tax += gain * (stopajRate(f, l.date, sell, rules) ?? 0);
  }
  return { gross, tax, net: gross - tax };
}

export type Trade = { code: string; value: number; target: number; amount: number; after: number }; // amount: + al, - sat (₺)

// Yeniden dengeleme: hedef ağırlıklar (%, toplamı 100 değilse oranlanır) için gereken al/sat tutarları.
// cash: eklenecek yeni para. noSell: satış yapmadan yalnız yeni parayla, hedefin gerisindekilerden açıkları oranında al
// (açıklar toplamı her zaman ≥ cash: Σ max(0, hedef - değer) ≥ Σ (hedef - değer) = cash, yani para hep açıklara yeter).
export function rebalance(rows: { code: string; value: number; target: number }[], cash = 0, noSell = false): Trade[] {
  const ts = rows.reduce((s, r) => s + Math.max(0, r.target), 0);
  if (ts <= 0) return [];
  const total = rows.reduce((s, r) => s + r.value, 0) + cash;
  const w = rows.map((r) => Math.max(0, r.target) / ts);
  let amounts: number[];
  if (!noSell) amounts = rows.map((r, i) => total * w[i] - r.value);
  else {
    const gap = rows.map((r, i) => Math.max(0, total * w[i] - r.value)), g = gap.reduce((s, x) => s + x, 0);
    amounts = gap.map((x) => (g > 0 ? (cash * x) / g : 0));
  }
  return rows.map((r, i) => ({ code: r.code, value: r.value, target: w[i] * 100, amount: amounts[i], after: r.value + amounts[i] }));
}

const MIN_N = 20;

// Portföy riski: tüm fonların ortak günlerindeki günlük getirilerden kovaryans matrisi.
// vol: yıllık portföy volatilitesi %, contrib: fon başına varyans katkısı % (toplam 100), div: çeşitlendirme oranı
// (ağırlıklı ortalama fon volatilitesi / portföy volatilitesi; 1 = hiç çeşitlendirme yok, büyüdükçe iyi).
export function portfolioRisk(weights: number[], rets: Map<string, number>[]): { vol: number; contrib: number[]; div: number; n: number } | null {
  if (!rets.length || rets.length !== weights.length) return null;
  const dates = [...rets[0].keys()].filter((d) => rets.every((m) => m.has(d)));
  if (dates.length < MIN_N) return null;
  const x = rets.map((m) => dates.map((d) => m.get(d)!));
  const mean = x.map((v) => v.reduce((s, a) => s + a, 0) / v.length);
  const cov = x.map((a, i) => x.map((b, j) => a.reduce((s, v, k) => s + (v - mean[i]) * (b[k] - mean[j]), 0) / (dates.length - 1)));
  const ws = weights.reduce((s, v) => s + v, 0), w = weights.map((v) => v / ws);
  const mc = cov.map((row) => row.reduce((s, c, j) => s + c * w[j], 0)); // marjinal katkı (Σw)_i
  const variance = w.reduce((s, wi, i) => s + wi * mc[i], 0);
  if (!(variance > 1e-18)) return null;
  const vol = Math.sqrt(variance * 252) * 100;
  const avg = w.reduce((s, wi, i) => s + wi * Math.sqrt(cov[i][i] * 252) * 100, 0);
  return { vol, contrib: w.map((wi, i) => ((wi * mc[i]) / variance) * 100), div: avg / vol, n: dates.length };
}
