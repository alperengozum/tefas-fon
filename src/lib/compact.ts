import type { Fund } from "./db";
import { fold } from "./classify";

// Liste sayfası 2000+ fonu HTML'e gömüyordu (nesne başına ~1.3KB, Astro her değeri [0,v] ile sarıyor -> 2.6MB).
// Burada satırlar dizi, tekrar eden metinler (tür/kurucu) sözlük, bayraklar bit maskesi, sayılar yuvarlanmış: ~%85 küçük.
// Varlık dağılımı satır sonunda düz [anahtar indeksi, %, ...] dizisi (fon başına ~4 kalem); verisi yoksa null.
const RET = ["d1", "w1", "m1", "m3", "m6", "ytd", "y1", "y2", "y3", "y5"] as const;
const FLOW = ["flow_w1", "flow_m1", "flow_m3"] as const;
const FLAGS = ["fx", "islamic", "qualified", "stockFocus", "oks", "active"] as const;
const r2 = (v: number | null) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

export type FundRow = Fund & { hay: string }; // hay: arama için önceden küçültülmüş "kod ad"

// Liste dışı ek bilgi: usd = USD/TRY'nin aynı vadelerdeki getirisi (%), istemci getirileri USD bazına çevirir
export type ListMeta = { usd?: Record<string, number | null> };

const memo = new WeakMap<Fund[], { key: string; out: string }>(); // listFunds önbelleği aynı diziyi döndürür: her istekte yeniden kodlama yok
export function encodeFunds(funds: Fund[], meta: ListMeta = {}): string {
  const key = JSON.stringify(meta), hit = memo.get(funds);
  if (hit?.key === key) return hit.out;
  const dict = (k: "type" | "founder") => [...new Set(funds.map((f) => f[k]).filter((x): x is string => !!x))];
  const types = dict("type"), founders = dict("founder");
  const assets = [...new Set(funds.flatMap((f) => Object.keys(f.alloc ?? {})))];
  const idx = (a: string[]) => new Map(a.map((v, i) => [v, i]));
  const [ti, fi, ai] = [idx(types), idx(founders), idx(assets)];
  const rows = funds.map((f) => [
    f.code, f.name, ti.get(f.type), fi.get(f.founder),
    FLAGS.reduce((m, k, i) => m | (f[k] ? 1 << i : 0), 0),
    Math.round(f.price * 1e4) / 1e4, Math.round(f.size), f.investors, r2(f.stock), f.risk,
    ...RET.map((k) => r2(f[k])), ...FLOW.map((k) => (f[k] == null ? null : Math.round(f[k]!))),
    f.alloc ? Object.entries(f.alloc).flatMap(([k, v]) => [ai.get(k), r2(v)]) : null,
    r2(f.vol), r2(f.mdd),
  ]);
  const out = JSON.stringify({ types, founders, assets, rows, ...meta });
  memo.set(funds, { key, out });
  return out;
}

export const decodeFunds = (json: string): FundRow[] => decodeList(json).funds;

export function decodeList(json: string): { funds: FundRow[] } & ListMeta {
  const { types, founders, assets = [], rows, usd } = JSON.parse(json) as { types: string[]; founders: string[]; assets?: string[]; rows: any[][] } & ListMeta;
  return { usd, funds: rows.map((r) => {
    const f: any = { code: r[0], kind: "", name: r[1], type: types[r[2]], founder: founders[r[3]],
      price: r[5], size: r[6], investors: r[7], stock: r[8], risk: r[9] };
    FLAGS.forEach((k, i) => (f[k] = !!(r[4] & (1 << i))));
    RET.forEach((k, i) => (f[k] = r[10 + i]));
    FLOW.forEach((k, i) => (f[k] = r[10 + RET.length + i]));
    const at = 10 + RET.length + FLOW.length;
    const a: number[] | null = r[at] ?? null;
    f.vol = r[at + 1] ?? null;
    f.mdd = r[at + 2] ?? null;
    f.alloc = a && {};
    for (let i = 0; a && i < a.length; i += 2) f.alloc[assets[a[i]]] = a[i + 1];
    f.hay = fold(`${f.code} ${f.name}`);
    return f as FundRow;
  }) };
}
