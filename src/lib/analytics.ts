import type { Detail } from "./db";

// `days` gün önceki (ytd: yıl başından önceki) son fiyata göre getiri %
export function ret(h: Detail["history"], days: number | "ytd"): number | null {
  const last = h[h.length - 1];
  if (!last) return null;
  const cut = days === "ytd"
    ? new Date(new Date(last.date.slice(0, 4) + "-01-01").getTime() - 864e5)
    : new Date(new Date(last.date).getTime() - days * 864e5);
  const c = cut.toISOString().slice(0, 10);
  const old = [...h].reverse().find((r) => r.date <= c);
  return old && old.price ? (last.price / old.price - 1) * 100 : null;
}

export const RETURNS: [string, number | "ytd"][] = [["1H", 7], ["1A", 30], ["3A", 91], ["6A", 182], ["YBB", "ytd"], ["1Y", 365], ["2Y", 730], ["3Y", 1095], ["5Y", 1825]];
