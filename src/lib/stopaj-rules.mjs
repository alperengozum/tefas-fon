// Yatırım fonu stopaj oranları (GVK geçici 67, 2006/10731 BKK 1/a), katılma payının ALIŞ (iktisap) tarihine göre.
// Hem src/lib/portfolio.ts (hesap) hem scripts/stopaj-watch.mjs (Resmi Gazete bekçisi: bilinen kararlar) okur; düz JS ki
// node script'i tip ayıklamadan içe aktarabilsin.
// Kaynak: Ziraat Portföy "Yatırım fonları stopaj oranları (23.12.2020'den itibaren iktisap edilenler)", 27.03.2026.
//
// GÜNCELLEME OTOMATİK: scripts/stopaj-watch.mjs her gün portföy şirketi/banka stopaj tablolarını (scripts/stopaj-sources.mjs) okur;
// geçmişle tutarlı bir kaynak yeni bir dönem gösterirse satırı DB'ye (stopaj_rule) yazar, site mergeRules ile birleştirir.
// Bu dosyadaki tablo taban; elle satır eklemek de mümkün. Satırlar `from`a göre artan sırada; her satır bir sonrakinin `from`una kadar geçerli.
//
// a: değişken, karma, eurobond, dış borçlanma, yabancı, serbest fonlar ve adında "döviz" geçenler
// b: diğer fonlar (borçlanma araçları, para piyasası, kıymetli maden, …) ve 2 yıldan kısa tutulan GYF/GSYF
// serbestHisseYogun: TEFAS'ta işlem görmeyen serbest hisse senedi yoğun fonlar (yoksa 0, diğer hisse yoğunlarla aynı)
// Her dönemde: hisse senedi yoğun fon %0; portföyünün ≥ %51'i BIST hissesi olup 1 yıldan uzun tutulan %0; 2 yıldan uzun tutulan GYF/GSYF %0.
/** @typedef {{ from: string; a: number; b: number; serbestHisseYogun?: number; karar?: string; rg?: string }} StopajRule */

/** @type {StopajRule[]} */
export const STOPAJ_RULES = [
  { from: "0000-01-01", a: 0.10, b: 0.10 },
  { from: "2020-12-23", a: 0.10, b: 0 },
  { from: "2024-05-01", a: 0.10, b: 0.075 },
  { from: "2024-11-01", a: 0.10, b: 0.10 },
  { from: "2025-02-01", a: 0.15, b: 0.15 },
  { from: "2025-07-09", a: 0.175, b: 0.175, karar: "10041", rg: "2025-07-09/32951" },
  { from: "2026-03-27", a: 0.175, b: 0.175, serbestHisseYogun: 0.175, karar: "11107", rg: "2026-03-27/33206" },
];

// İncelenmiş ama gerçek kişilerin fon payı oranlarını değiştirmeyen geçici 67 kararları (bekçi bunları "bekliyor" saymaz).
export const REVIEWED = [
  { karar: "11444", rg: "2026-06-20/33286", note: "2006/10731 geçici 4 süresi 31.12.2026'ya uzatıldı; doğrudan DİBS ve VKŞ kira sertifikası gelirleri, fon payı değil" },
  { karar: "11734", rg: "2026-09-05/33361", note: "1(a)(2): yalnız KVK 2/1 kapsamındaki menkul kıymet yatırım kurumları (PPF payı %10, diğer %0); gerçek kişi oranları değişmedi" },
];

// Bekçi bu sayıları işlenmiş sayar; burada olmayan bir geçici 67 kararını "bekliyor" diye kaydedip kaynaklarda yeni dönemi bekler.
export const KNOWN_KARARLAR = new Set([...STOPAJ_RULES.flatMap((r) => (r.karar ? [r.karar] : [])), ...REVIEWED.map((r) => r.karar)]);

/** Koddaki tabloya kaynaklardan otomatik eklenen satırları (DB: stopaj_rule) birleştirir; aynı `from` varsa ek satır kazanır. */
export function mergeRules(/** @type {StopajRule[]} */ base, /** @type {StopajRule[]} */ extra = []) {
  const m = new Map(base.map((r) => [r.from, r]));
  for (const r of extra) m.set(r.from, { ...m.get(r.from), ...r });
  return [...m.values()].sort((a, b) => (a.from < b.from ? -1 : 1));
}

/** Alış gününde geçerli kural (`from` ≤ buy olan son satır) */
export const ruleAt = (/** @type {string} */ buy, rules = STOPAJ_RULES) => rules.reduce((m, r) => (r.from <= buy ? r : m), rules[0]);
