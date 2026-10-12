// Herkese açık API (/api/v1) ve MCP sunucusu (/mcp) için ortak sorgu katmanı. Alan adları İngilizce ve sabit
// (sitenin kendi /api/funds sıkıştırılmış biçiminden bağımsız): sözleşme değişirse /api/v2.
import type { Fund } from "./db";
import { fold } from "./classify.ts";
import { ret, RETURNS, BENCH } from "./analytics.ts";
import { corr, dailyReturns } from "./stats.ts";
import { label } from "./format.ts";
import { SCANS, runScan } from "./scans.ts";

// Herkese açık API ve MCP: IP başına dakikada istek sınırı (middleware uygular)
export const API_LIMIT = 60;
export const KINDS: Record<string, string> = { yat: "YAT", bes: "EMK", byf: "BYF", gyf: "GYF" };
const RET_KEYS = ["d1", "w1", "m1", "m3", "m6", "ytd", "y1", "y2", "y3", "y5"] as const;
export const SORT_KEYS = [...RET_KEYS, "size", "investors", "flow_m1", "volatility"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const r2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);
const kindKey = (k: string) => Object.entries(KINDS).find(([, v]) => v === k)?.[0] ?? k.toLowerCase();

export function summary(f: Fund) {
  return {
    code: f.code, name: f.name, kind: kindKey(f.kind), type: f.type, founder: f.founder, active: f.active,
    price: f.price, size: f.size, investors: f.investors,
    returns: Object.fromEntries(RET_KEYS.map((k) => [k, r2(f[k])])) as Record<(typeof RET_KEYS)[number], number | null>,
    flows: { w1: f.flow_w1 == null ? null : Math.round(f.flow_w1), m1: f.flow_m1 == null ? null : Math.round(f.flow_m1), m3: f.flow_m3 == null ? null : Math.round(f.flow_m3) },
    risk: { score: f.risk, volatility: r2(f.vol), max_drawdown_1y: r2(f.mdd) },
    tags: { fx: f.fx, islamic: f.islamic, qualified: f.qualified, stock_focus: f.stockFocus, oks: f.oks },
    stock_pct: r2(f.stock),
    url: `/fon/${f.code}`,
  };
}
export type FundSummary = ReturnType<typeof summary>;

export type SearchOpts = {
  query?: string; type?: string; founder?: string; sort?: SortKey; order?: "asc" | "desc";
  limit?: number; offset?: number; activeOnly?: boolean; minSize?: number;
};

const sortVal = (f: Fund, k: SortKey) => (k === "volatility" ? f.vol : f[k]);

// Saf: arama (kod/ad, Türkçe büyük-küçük harf duyarsız), tür/kurucu filtresi, sıralama (boş değerler sonda), sayfalama
export function searchFunds(funds: Fund[], o: SearchOpts = {}): { total: number; items: FundSummary[] } {
  const q = o.query ? fold(o.query.trim()) : "", type = o.type ? fold(o.type) : "", founder = o.founder ? fold(o.founder) : "";
  const sort = o.sort ?? "size", dir = o.order === "asc" ? 1 : -1;
  const hit = funds.filter((f) =>
    (o.activeOnly === false || f.active)
    && (!q || fold(`${f.code} ${f.name}`).includes(q))
    && (!type || fold(f.type ?? "").includes(type))
    && (!founder || fold(f.founder ?? "").includes(founder))
    && (!o.minSize || f.size >= o.minSize));
  hit.sort((a, b) => {
    const x = sortVal(a, sort), y = sortVal(b, sort);
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return (x - y) * dir;
  });
  const offset = Math.max(0, o.offset ?? 0), limit = Math.min(Math.max(1, o.limit ?? 20), 100);
  return { total: hit.length, items: hit.slice(offset, offset + limit).map(summary) };
}

export const normCode = (c: unknown) => {
  const s = String(c ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(s)) throw new ApiError(400, `Geçersiz fon kodu: ${JSON.stringify(c)}`);
  return s;
};
export const normTicker = (t: unknown) => {
  const s = String(t ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < 2 || s.length > 8) throw new ApiError(400, `Geçersiz hisse kodu: ${JSON.stringify(t)}`);
  return s;
};
export function parseKind(k: unknown): string[] {
  const s = String(k ?? "all").toLowerCase();
  if (s === "all") return Object.values(KINDS);
  if (!KINDS[s]) throw new ApiError(400, `Geçersiz tür: ${s} (yat, bes, byf, gyf, all)`);
  return [KINDS[s]];
}
export function parseSort(s: unknown): SortKey | undefined {
  if (s == null || s === "") return undefined;
  if (!(SORT_KEYS as readonly string[]).includes(String(s))) throw new ApiError(400, `Geçersiz sıralama: ${s} (${SORT_KEYS.join(", ")})`);
  return s as SortKey;
}

const RET_NAME: Record<string, string> = { "1H": "w1", "1A": "m1", "3A": "m3", "6A": "m6", YBB: "ytd", "1Y": "y1", "2Y": "y2", "3Y": "y3", "5Y": "y5" };
type Pt = { date: string; price: number };
const periodReturns = (h: Pt[]) => Object.fromEntries(RETURNS.map(([k, d]) => [RET_NAME[k], r2(ret(h, d))]));

type Deps = {
  listFunds: (kind: string) => Promise<{ ref: string; funds: Fund[] }>;
  getFund: (code: string) => Promise<{ code: string; name: string; kind: string; history: (Pt & { size: number; investors: number; shares: number })[]; alloc: Record<string, number>; allocDate: string | null; active?: boolean; tasfiye?: string | null } | null>;
  getHoldings: (code: string) => Promise<{ holdings: { ticker: string; weight: number }[]; report: string | null; published: string | null }>;
  getBench: () => Promise<Record<string, Pt[]>>;
  tickerFunds: (ticker: string) => Promise<{ code: string; name: string; kind: string; weight: number; size: number | null; amount: number | null }[]>;
};

export function makeApi(db: Deps) {
  const all = async (kinds: string[]) => {
    const parts = await Promise.all(kinds.map(db.listFunds));
    return { ref: parts[0]?.ref ?? "", funds: parts.flatMap((p) => p.funds) };
  };

  async function funds(kinds: string[], o: SearchOpts) {
    const { ref, funds } = await all(kinds);
    return { data_date: ref, ...searchFunds(funds, o) };
  }

  async function fund(code: string, historyDays = 0) {
    const f = await db.getFund(code);
    if (!f) throw new ApiError(404, `Fon bulunamadı: ${code}`);
    const [{ funds: listed, ref }, h, bench] = await Promise.all([db.listFunds(f.kind), db.getHoldings(code), db.getBench()]);
    const me = listed.find((x) => x.code === code);
    const last = f.history[f.history.length - 1];
    const days = Math.min(Math.max(0, Math.floor(historyDays)), 1825);
    const cut = new Date(new Date(last.date).getTime() - days * 864e5).toISOString().slice(0, 10);
    return {
      data_date: ref,
      ...(me ? summary(me) : { code: f.code, name: f.name, kind: kindKey(f.kind), active: f.active ?? false }),
      date: last.date, price: last.price, size: last.size, investors: last.investors,
      liquidation_notice: f.tasfiye ?? null,
      returns: periodReturns(f.history),
      benchmarks: Object.fromEntries(BENCH.filter(([s]) => bench[s]?.length).map(([s, n]) => [s, { name: n, returns: periodReturns(bench[s]) }])),
      allocation: { date: f.allocDate, items: Object.entries(f.alloc).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, name: label(k), pct: r2(v) })) },
      holdings: { report: h.report, published: h.published, items: h.holdings.map((x) => ({ ticker: x.ticker, weight: r2(x.weight) })) },
      history: days ? f.history.filter((r) => r.date >= cut).map((r) => ({ date: r.date, price: r.price, size: r.size, investors: r.investors })) : undefined,
      url: `/fon/${f.code}`,
    };
  }

  async function stockFunds(ticker: string, minWeight = 0) {
    const rows = (await db.tickerFunds(ticker)).filter((r) => r.weight >= minWeight);
    return { ticker, count: rows.length, items: rows.map((r) => ({ code: r.code, name: r.name, kind: kindKey(r.kind), weight: r2(r.weight), fund_size: r.size, est_position_tl: r.amount == null ? null : Math.round(r.amount) })) };
  }

  async function compare(codes: string[]) {
    const uniq = [...new Set(codes.map(normCode))];
    if (uniq.length < 2 || uniq.length > 10) throw new ApiError(400, "2 ile 10 arası fon kodu gerekli");
    const details = await Promise.all(uniq.map((c) => db.getFund(c)));
    const missing = uniq.filter((_, i) => !details[i]);
    const found = details.filter((d): d is NonNullable<typeof d> => !!d);
    const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const rets = found.map((f) => dailyReturns(f.history, since));
    return {
      missing,
      funds: found.map((f) => ({ code: f.code, name: f.name, kind: kindKey(f.kind), price: f.history[f.history.length - 1].price, returns: periodReturns(f.history) })),
      correlation_1y: { codes: found.map((f) => f.code), matrix: rets.map((a) => rets.map((b) => r2(corr(a, b)))) },
    };
  }

  async function scan(slug: string, limit = 20) {
    const s = SCANS.find((x) => x.slug === slug);
    if (!s) throw new ApiError(404, `Tarama bulunamadı: ${slug} (${SCANS.map((x) => x.slug).join(", ")})`);
    const { ref, funds } = await db.listFunds(s.kind);
    return { slug: s.slug, title: s.title, description: s.description, data_date: ref, items: runScan(s, funds, Math.min(Math.max(1, limit), 50)).map(summary) };
  }

  return { funds, fund, stockFunds, compare, scan };
}
