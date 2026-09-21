import pg from "pg";
import { classify, riskOf } from "./classify";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas",
});

export type Fund = {
  code: string; kind: string; name: string; price: number; size: number; investors: number;
  main: string | null; stock: number;
  founder: string; type: string; fx: boolean; islamic: boolean; qualified: boolean; stockFocus: boolean; oks: boolean;
  vol: number | null; risk: number | null;
  d1: number | null; w1: number | null; m1: number | null; m3: number | null; m6: number | null; y1: number | null; y2: number | null; y3: number | null; y5: number | null; ytd: number | null;
  flow_w1: number | null; flow_m1: number | null; flow_m3: number | null;
};

// vade adı -> kaç gün önceki fiyat (ytd ayrı: yıl başından önceki son gün)
const PERIODS: Record<string, string> = { d1: "1", w1: "7", m1: "30", m3: "91", m6: "182", y1: "365", y2: "730", y3: "1095", y5: "1825" };
const FLOWS = ["w1", "m1", "m3"];

export async function listFunds(kind: string): Promise<{ ref: string; funds: Fund[] }> {
  const dates = Object.entries(PERIODS)
    .map(([k, n]) => `SELECT '${k}' k, (SELECT max(date) FROM info WHERE date <= ref.d - ${n}) d FROM ref`)
    .concat(`SELECT 'ytd', (SELECT max(date) FROM info WHERE date < date_trunc('year', ref.d)) FROM ref`)
    .join(" UNION ALL ");
  const keys = [...Object.keys(PERIODS), "ytd"];
  const joins = keys.map((k) => `LEFT JOIN info o_${k} ON o_${k}.code = c.code AND o_${k}.date = (SELECT d FROM pd WHERE k='${k}')`).join("\n");
  const rets = keys.map((k) => `(c.price / NULLIF(o_${k}.price, 0) - 1) * 100 AS ${k}`).join(", ");
  const flows = FLOWS.map((k) => `(c.shares - o_${k}.shares) * c.price AS flow_${k}`).join(", ");
  const [{ rows }, { rows: vols }] = await Promise.all([pool.query(
    `WITH ref AS (SELECT max(date) d FROM info), pd AS (${dates})
     SELECT c.code, c.kind, c.name, c.price, c.size, c.investors, ref.d::text AS ref,
            m.main, COALESCE((a.data->>'hs')::float8, 0) AS stock, ${rets}, ${flows}
     FROM info c CROSS JOIN ref
     ${joins}
     LEFT JOIN alloc a ON a.code = c.code
     LEFT JOIN LATERAL (SELECT key AS main FROM jsonb_each_text(a.data) ORDER BY value::float8 DESC LIMIT 1) m ON true
     WHERE c.kind = $1 AND c.date = ref.d AND c.size IS NOT NULL
     ORDER BY c.size DESC`,
    [kind],
  ),
  // yıllık volatilite: son 1 yılın günlük getiri std sapması × √252
  pool.query(
    `SELECT code, stddev_samp(r) * sqrt(252) * 100 AS vol FROM (
       SELECT code, price / NULLIF(lag(price) OVER (PARTITION BY code ORDER BY date), 0) - 1 AS r
       FROM info WHERE kind = $1 AND date > (SELECT max(date) FROM info) - 365) t
     WHERE r IS NOT NULL GROUP BY code HAVING count(*) > 20`,
    [kind],
  )]);
  const vol = new Map<string, number>(vols.map((v) => [v.code, v.vol]));
  const funds = rows.map((r) => {
    const v = vol.get(r.code) ?? null;
    return { ...r, ...classify(r.name, r.kind), vol: v, risk: riskOf(v) };
  });
  return { ref: rows[0]?.ref ?? "", funds };
}

export type Detail = {
  code: string; name: string; kind: string;
  history: { date: string; price: number; size: number; investors: number; shares: number }[];
  alloc: Record<string, number>; allocDate: string | null;
};

export async function getFund(code: string): Promise<Detail | null> {
  const [h, a] = await Promise.all([
    pool.query(`SELECT kind, name, date::text, price, size, investors, shares FROM info WHERE code=$1 ORDER BY date`, [code]),
    pool.query(`SELECT date::text, data FROM alloc WHERE code=$1`, [code]),
  ]);
  if (!h.rows.length) return null;
  const last = h.rows[h.rows.length - 1];
  return { code, name: last.name, kind: last.kind, history: h.rows, alloc: a.rows[0]?.data ?? {}, allocDate: a.rows[0]?.date ?? null };
}

// Rakip analizi: aynı türde, varlık dağılımı en yakın fonlar (öklid mesafesi)
export async function peers(code: string, kind: string, n = 8) {
  const { rows } = await pool.query(
    `SELECT a.code, i.name, a.data FROM alloc a
     JOIN info i ON i.code = a.code AND i.date = a.date WHERE i.kind = $1`,
    [kind],
  );
  const me = rows.find((r) => r.code === code);
  if (!me) return [];
  const dist = (x: Record<string, number>, y: Record<string, number>) => {
    let s = 0;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) s += ((x[k] ?? 0) - (y[k] ?? 0)) ** 2;
    return Math.sqrt(s);
  };
  return rows.filter((r) => r.code !== code)
    .map((r) => ({ code: r.code as string, name: r.name as string, d: dist(me.data, r.data) }))
    .sort((a, b) => a.d - b.d).slice(0, n);
}
