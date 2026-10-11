// Hedef planlayıcı: fonun geçmiş günlük getirilerinden blok bootstrap (21 işlem günü ≈ 1 ay) ile Monte Carlo senaryoları.
// Her senaryoda son değer başlangıç ve aylık tutarda doğrusal: değer = başlangıç × A + aylık × B
// (A: başlangıç parasının büyümesi, B: ay başı katkıların büyümeleri toplamı). Böylece olasılık ve "hedef için gereken aylık"
// yeniden simülasyon olmadan kesin hesaplanır. Enflasyon verilirse katkılar her ay enflasyonla artar ve değerler bugünün parasına
// indirgenir (A, B zaten indirgenmiş döner).

// Tohumlu rastgele (mulberry32): aynı girdi aynı sonucu verir (sayfa yenilemede sayılar oynamaz, test edilebilir)
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

export type Paths = { years: number; A: number[][]; B: number[][] }; // [yıl 1..years][senaryo]

// daily: günlük getiriler (oran). inflation: yıllık oran (0 = nominal). Katkı her ay başında, ilk ay dahil.
export function simulatePaths(daily: number[], years: number, n: number, seed: number, inflation = 0, block = 21): Paths {
  if (daily.length < block) throw new Error("yetersiz veri");
  const r = rng(seed), months = years * 12, im = (1 + inflation) ** (1 / 12);
  const A = Array.from({ length: years }, () => new Array<number>(n)), B = Array.from({ length: years }, () => new Array<number>(n));
  for (let p = 0; p < n; p++) {
    let a = 1, b = 0, defl = 1, contrib = 1;
    for (let m = 0; m < months; m++) {
      b += contrib; // ay başı katkı (enflasyonla büyüyen)
      const s = Math.floor(r() * (daily.length - block + 1));
      let g = 1;
      for (let k = s; k < s + block; k++) g *= 1 + daily[k];
      a *= g; b *= g; contrib *= im; defl *= im;
      if ((m + 1) % 12 === 0) { const y = (m + 1) / 12 - 1; A[y][p] = a / defl; B[y][p] = b / defl; }
    }
  }
  return { years, A, B };
}

export const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

export type YearStat = { year: number; p10: number; p50: number; p90: number };
export type GoalStats = { yearly: YearStat[]; prob: number | null; need50: number | null; need80: number | null };

// goal verilmezse olasılık/gereken aylık null. need: hedefe %50 / %80 olasılıkla ulaşmak için gereken aylık (başlangıç sabit)
export function goalStats(paths: Paths, initial: number, monthly: number, goal: number | null): GoalStats {
  const yearly = paths.A.map((As, y) => {
    const v = As.map((a, p) => initial * a + monthly * paths.B[y][p]).sort((x, z) => x - z);
    return { year: y + 1, p10: quantile(v, 0.1), p50: quantile(v, 0.5), p90: quantile(v, 0.9) };
  });
  if (goal == null) return { yearly, prob: null, need50: null, need80: null };
  const A = paths.A[paths.years - 1], B = paths.B[paths.years - 1];
  const prob = A.filter((a, p) => initial * a + monthly * B[p] >= goal).length / A.length;
  // senaryo başına hedefi tam tutturan aylık; q olasılık için bu dağılımın q yüzdeliği yeterli
  const need = A.map((a, p) => Math.max(0, (goal - initial * a) / B[p])).sort((x, z) => x - z);
  return { yearly, prob, need50: quantile(need, 0.5), need80: quantile(need, 0.8) };
}
