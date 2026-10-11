// İki KAP portföy raporu arasında hisse değişimleri. Ağırlık = portföy değerine %; fiyat hareketi de ağırlığı değiştirir,
// bu yüzden `min` puandan küçük değişimler gürültü sayılır (yeni giren / tamamen çıkan her zaman listelenir).
export type Hold = { ticker: string; weight: number };
export type Change = { ticker: string; from: number; to: number; delta: number };
export type HoldDiff = { added: Hold[]; removed: Hold[]; up: Change[]; down: Change[] };

export function diffHoldings(prev: Hold[], cur: Hold[], min = 0.5): HoldDiff {
  const p = new Map(prev.map((h) => [h.ticker, h.weight])), c = new Map(cur.map((h) => [h.ticker, h.weight]));
  const added = cur.filter((h) => !p.has(h.ticker)).sort((a, b) => b.weight - a.weight);
  const removed = prev.filter((h) => !c.has(h.ticker)).sort((a, b) => b.weight - a.weight);
  const both = cur.filter((h) => p.has(h.ticker)).map((h) => ({ ticker: h.ticker, from: p.get(h.ticker)!, to: h.weight, delta: h.weight - p.get(h.ticker)! }));
  return {
    added, removed,
    up: both.filter((x) => x.delta >= min).sort((a, b) => b.delta - a.delta),
    down: both.filter((x) => x.delta <= -min).sort((a, b) => a.delta - b.delta),
  };
}
