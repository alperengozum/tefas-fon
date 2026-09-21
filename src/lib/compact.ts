import type { Fund } from "./db";

// Liste sayfası 2000+ fonu HTML'e gömüyordu (nesne başına ~1.3KB, Astro her değeri [0,v] ile sarıyor -> 2.6MB).
// Burada satırlar dizi, tekrar eden metinler (tür/kurucu/kategori) sözlük, bayraklar bit maskesi, sayılar yuvarlanmış: ~%85 küçük.
const RET = ["d1", "w1", "m1", "m3", "m6", "ytd", "y1", "y2", "y3", "y5"] as const;
const FLOW = ["flow_w1", "flow_m1", "flow_m3"] as const;
const FLAGS = ["fx", "islamic", "qualified", "stockFocus", "oks", "active"] as const;
const r2 = (v: number | null) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

export type FundRow = Fund & { hay: string }; // hay: arama için önceden küçültülmüş "kod ad"

const memo = new WeakMap<Fund[], string>(); // listFunds önbelleği aynı diziyi döndürür: her istekte yeniden kodlama yok
export function encodeFunds(funds: Fund[]): string {
  const hit = memo.get(funds);
  if (hit) return hit;
  const dict = (k: "type" | "founder" | "main") => [...new Set(funds.map((f) => f[k]).filter((x): x is string => !!x))];
  const types = dict("type"), founders = dict("founder"), mains = dict("main");
  const idx = (a: string[]) => new Map(a.map((v, i) => [v, i]));
  const [ti, fi, mi] = [idx(types), idx(founders), idx(mains)];
  const rows = funds.map((f) => [
    f.code, f.name, ti.get(f.type), fi.get(f.founder), f.main ? mi.get(f.main) : -1,
    FLAGS.reduce((m, k, i) => m | (f[k] ? 1 << i : 0), 0),
    Math.round(f.price * 1e4) / 1e4, Math.round(f.size), f.investors, r2(f.stock), f.risk,
    ...RET.map((k) => r2(f[k])), ...FLOW.map((k) => (f[k] == null ? null : Math.round(f[k]!))),
  ]);
  const out = JSON.stringify({ types, founders, mains, rows });
  memo.set(funds, out);
  return out;
}

export function decodeFunds(json: string): FundRow[] {
  const { types, founders, mains, rows } = JSON.parse(json) as { types: string[]; founders: string[]; mains: string[]; rows: any[][] };
  return rows.map((r) => {
    const f: any = { code: r[0], kind: "", name: r[1], type: types[r[2]], founder: founders[r[3]], main: r[4] >= 0 ? mains[r[4]] : null,
      price: r[6], size: r[7], investors: r[8], stock: r[9], risk: r[10], vol: null };
    FLAGS.forEach((k, i) => (f[k] = !!(r[5] & (1 << i))));
    RET.forEach((k, i) => (f[k] = r[11 + i]));
    FLOW.forEach((k, i) => (f[k] = r[11 + RET.length + i]));
    f.hay = `${f.code} ${f.name}`.toLocaleLowerCase("tr");
    return f as FundRow;
  });
}
