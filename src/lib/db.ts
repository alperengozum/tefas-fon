import pg from "pg";
import { classify, fold, riskOf } from "./classify";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas",
});

export type Fund = {
  code: string; kind: string; name: string; price: number; size: number; investors: number;
  main: string | null; stock: number; active: boolean;
  founder: string; type: string; fx: boolean; islamic: boolean; qualified: boolean; stockFocus: boolean; oks: boolean;
  vol: number | null; risk: number | null;
  d1: number | null; w1: number | null; m1: number | null; m3: number | null; m6: number | null; y1: number | null; y2: number | null; y3: number | null; y5: number | null; ytd: number | null;
  flow_w1: number | null; flow_m1: number | null; flow_m3: number | null;
};

// vade adı -> kaç gün önceki fiyat (ytd ayrı: yıl başından önceki son gün)
const PERIODS: Record<string, string> = { d1: "1", w1: "7", m1: "30", m3: "91", m6: "182", y1: "365", y2: "730", y3: "1095", y5: "1825" };
const FLOWS = ["w1", "m1", "m3"];
// TEFAS'ta aktif: fonun son verisi en güncel veri gününden en fazla bu kadar gün geride (tatil/veri boşluğu payı)
const ACTIVE_DAYS = 7;

async function queryFunds(kind: string): Promise<{ ref: string; funds: Fund[] }> {
  const dates = Object.entries(PERIODS)
    .map(([k, n]) => `SELECT '${k}' k, (SELECT max(date) FROM info WHERE date <= ref.d - ${n}) d FROM ref`)
    .concat(`SELECT 'ytd', (SELECT max(date) FROM info WHERE date < date_trunc('year', ref.d)) FROM ref`)
    .join(" UNION ALL ");
  const keys = [...Object.keys(PERIODS), "ytd"];
  const joins = keys.map((k) => `LEFT JOIN info o_${k} ON o_${k}.code = c.code AND o_${k}.date = (SELECT d FROM pd WHERE k='${k}')`).join("\n");
  // pasif fonun son fiyatı eski olduğundan güncel vadelerle kıyaslanamaz: getiri/akış boş
  const rets = keys.map((k) => `CASE WHEN c.date >= ref.d - ${ACTIVE_DAYS} THEN (c.price / NULLIF(o_${k}.price, 0) - 1) * 100 END AS ${k}`).join(", ");
  const flows = FLOWS.map((k) => `CASE WHEN c.date >= ref.d - ${ACTIVE_DAYS} THEN (c.shares - o_${k}.shares) * c.price END AS flow_${k}`).join(", ");
  const { rows } = await pool.query(
    // k: fon kodları (recursive skip scan), last: fon başına son veri günü. GROUP BY tüm tabloyu tarıyordu, bu ~3x hızlı.
    `WITH RECURSIVE ref AS (SELECT max(date) d FROM info), pd AS (${dates}),
     k AS (SELECT min(code) code FROM info UNION ALL SELECT (SELECT min(code) FROM info WHERE code > k.code) FROM k WHERE k.code IS NOT NULL),
     last AS (SELECT code, (SELECT max(date) FROM info WHERE info.code = k.code) d FROM k WHERE code IS NOT NULL)
     SELECT c.code, c.kind, c.name, c.price, c.size, c.investors, ref.d::text AS ref, c.date >= ref.d - ${ACTIVE_DAYS} AS active,
            m.main, COALESCE((a.data->>'hs')::float8, 0) AS stock, v.vol, ${rets}, ${flows}
     FROM last JOIN info c ON c.code = last.code AND c.date = last.d CROSS JOIN ref
     ${joins}
     LEFT JOIN alloc a ON a.code = c.code
     LEFT JOIN fund_vol v ON v.code = c.code
     LEFT JOIN LATERAL (SELECT key AS main FROM jsonb_each_text(a.data) ORDER BY value::float8 DESC LIMIT 1) m ON true
     WHERE c.kind = $1 AND c.size IS NOT NULL
     ORDER BY c.size DESC`,
    [kind],
  );
  const funds = rows.map((r) => ({ ...r, ...classify(r.name, r.kind), risk: riskOf(r.vol) }));
  // Aynı kurucu İ/I farkıyla ayrı yazılmış olabilir (AZİMUT/AZIMUT): katlanmış anahtara göre en sık yazımı kullan.
  const count = new Map<string, number>(), best = new Map<string, string>();
  for (const { founder: n } of funds) count.set(n, (count.get(n) ?? 0) + 1);
  for (const [n, c] of count) { const k = fold(n), b = best.get(k); if (!b || c > count.get(b)!) best.set(k, n); }
  for (const f of funds) f.founder = best.get(fold(f.founder))!;
  return { ref: rows[0]?.ref ?? "", funds };
}

// Veri günde bir güncellenir; liste sorgusu ağır (10 join + jsonb). Tür başına bellek önbelleği, süresi dolunca eski sonuç
// hemen döner ve arkada yenilenir (stale-while-revalidate): kullanıcı sorguyu asla beklemez (ilk yükleme hariç).
const TTL = 10 * 60_000;
type Listed = { ref: string; funds: Fund[] };
const cache = new Map<string, { t: number; p: Promise<Listed>; refreshing?: boolean }>();
export function listFunds(kind: string): Promise<Listed> {
  const hit = cache.get(kind);
  if (hit) {
    if (Date.now() - hit.t > TTL && !hit.refreshing) {
      hit.refreshing = true;
      queryFunds(kind).then((v) => cache.set(kind, { t: Date.now(), p: Promise.resolve(v) })).catch(() => (hit.refreshing = false));
    }
    return hit.p;
  }
  const p = queryFunds(kind);
  cache.set(kind, { t: Date.now(), p });
  p.catch(() => cache.delete(kind)); // hatayı önbellekleme
  return p;
}

// Genel amaçlı TTL önbelleği (anahtar başına Promise; hata önbelleklenmez, en fazla 500 kayıt, en eski önce atılır).
// ponytail: süreç içi Map, tek konteyner; birden çok örnek olursa Redis. Veri günde bir değiştiği için 10 dk bayatlık kabul.
function cached<A extends unknown[], T>(fn: (...a: A) => Promise<T>, key: (...a: A) => string) {
  const m = new Map<string, { t: number; p: Promise<T> }>();
  return (...a: A): Promise<T> => {
    const k = key(...a), hit = m.get(k);
    if (hit && Date.now() - hit.t < TTL) return hit.p;
    const p = fn(...a);
    m.set(k, { t: Date.now(), p });
    p.catch(() => m.delete(k));
    if (m.size > 500) m.delete(m.keys().next().value!);
    return p;
  };
}

export type Detail = {
  code: string; name: string; kind: string;
  history: { date: string; price: number; size: number; investors: number; shares: number }[];
  alloc: Record<string, number>; allocDate: string | null;
  active?: boolean; // sadece getFund doldurur
};

export const getFund = cached(async (code: string): Promise<Detail | null> => {
  const [h, a, ref] = await Promise.all([
    pool.query(`SELECT kind, name, date::text, price, size, investors, shares FROM info WHERE code=$1 ORDER BY date`, [code]),
    pool.query(`SELECT date::text, data FROM alloc WHERE code=$1`, [code]),
    pool.query(`SELECT (max(date) - ${ACTIVE_DAYS})::text AS min FROM info`),
  ]);
  if (!h.rows.length) return null;
  const last = h.rows[h.rows.length - 1];
  return { code, name: last.name, kind: last.kind, history: h.rows, alloc: a.rows[0]?.data ?? {}, allocDate: a.rows[0]?.date ?? null, active: last.date >= ref.rows[0].min };
}, (code) => code);

// Rakip analizi: aynı türde, varlık dağılımı en yakın fonlar (öklid mesafesi)
// Ağır kısım (türün tüm dağılım satırları) tür başına önbelleklenir; mesafe hesabı istek başına ucuz.
const allocOf = cached(async (kind: string) => (await pool.query(
  `SELECT a.code, i.name, a.data FROM alloc a
   JOIN info i ON i.code = a.code AND i.date = a.date WHERE i.kind = $1`,
  [kind],
)).rows, (kind) => kind);

export async function peers(code: string, kind: string, n = 8) {
  const rows = await allocOf(kind);
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

export type Holding = { ticker: string; weight: number };

export const getHoldings = cached(async (code: string): Promise<{ holdings: Holding[]; report: string | null; published: string | null; note: string | null; seen: boolean }> => {
  const [h, m] = await Promise.all([
    pool.query(`SELECT ticker, weight FROM holdings WHERE code=$1 ORDER BY weight DESC`, [code]),
    pool.query(`SELECT report, published::text, note FROM holdings_meta WHERE code=$1`, [code]),
  ]);
  return { holdings: h.rows, report: m.rows[0]?.report ?? null, published: m.rows[0]?.published ?? null, note: m.rows[0]?.note ?? null, seen: m.rowCount > 0 };
}, (code) => code);

// Hisse filtresi: `ticker`ı en az `min` % ağırlıkla tutan fonlar -> {kod: ağırlık}
export const fundsHolding = cached(async (ticker: string, min: number): Promise<Record<string, number>> => {
  const { rows } = await pool.query(`SELECT code, weight FROM holdings WHERE ticker=$1 AND weight >= $2`, [ticker, min]);
  return Object.fromEntries(rows.map((r) => [r.code, r.weight]));
}, (ticker, min) => `${ticker}|${min}`);

// Karşılaştırma için toplu okuma: fon başına ayrı sorgu yerine 3 sorgu (geçmiş, dağılım, hisseler).
export const getFunds = cached(async (codes: string[]): Promise<{ funds: Detail[]; holdings: Map<string, Holding[]> }> => {
  if (!codes.length) return { funds: [], holdings: new Map() };
  const [h, a, hl] = await Promise.all([
    pool.query(`SELECT code, kind, name, date::text, price, size, investors, shares FROM info WHERE code = ANY($1) ORDER BY code, date`, [codes]),
    pool.query(`SELECT code, date::text, data FROM alloc WHERE code = ANY($1)`, [codes]),
    pool.query(`SELECT code, ticker, weight FROM holdings WHERE code = ANY($1) ORDER BY weight DESC`, [codes]),
  ]);
  const hist = new Map<string, any[]>(), alloc = new Map(a.rows.map((r) => [r.code, r]));
  for (const r of h.rows) (hist.get(r.code) ?? hist.set(r.code, []).get(r.code)!).push(r);
  const holdings = new Map<string, Holding[]>();
  for (const r of hl.rows) (holdings.get(r.code) ?? holdings.set(r.code, []).get(r.code)!).push({ ticker: r.ticker, weight: r.weight });
  const funds = codes.filter((c) => hist.has(c)).map((code) => {
    const rows = hist.get(code)!, last = rows[rows.length - 1];
    return { code, name: last.name, kind: last.kind, history: rows, alloc: alloc.get(code)?.data ?? {}, allocDate: alloc.get(code)?.date ?? null } as Detail;
  });
  return { funds, holdings };
}, (codes) => codes.join(","));

// Benchmark serileri (BIST100, USD, ALTIN), fon geçmişiyle aynı {date, price} biçiminde. Tablo boşsa {}.
// TEFAS'ta D tarihli fon fiyatı bir önceki işlem gününün kapanışını yansıtır (AKU/BIST100 korelasyonu: gecikme 0'da 0.00,
// -1'de 0.98), bu yüzden her endeks kapanışı bir sonraki işlem gününün tarihiyle etiketlenir; en son kapanış (henüz fon karşılığı yok) atılır.
export const getBench = cached(async (): Promise<Record<string, { date: string; price: number }[]>> => {
  const { rows } = await pool.query(`SELECT sym, date::text, price FROM bench ORDER BY sym, date`);
  const raw: Record<string, { date: string; price: number }[]> = {};
  for (const r of rows) (raw[r.sym] ??= []).push({ date: r.date, price: r.price });
  return Object.fromEntries(Object.entries(raw).map(([s, h]) => [s, h.slice(0, -1).map((r, i) => ({ date: h[i + 1].date, price: r.price }))]));
}, () => "b");

// `code` fonuyla ortak hisse ağırlığı (Σ min) en yüksek fonlar
export const overlapping = cached(async (code: string, n = 8): Promise<{ code: string; name: string; ov: number }[]> => (await pool.query(
  `WITH o AS (
     SELECT b.code, sum(least(a.weight, b.weight)) AS ov FROM holdings a JOIN holdings b ON b.ticker = a.ticker AND b.code <> a.code
     WHERE a.code = $1 GROUP BY b.code ORDER BY ov DESC LIMIT $2)
   SELECT o.code, i.name, o.ov FROM o JOIN LATERAL (SELECT name FROM info WHERE code = o.code ORDER BY date DESC LIMIT 1) i ON true ORDER BY o.ov DESC`,
  [code, n],
)).rows, (code, n) => `${code}|${n}`);

// Bir hisseyi tutan tüm fonlar: ağırlık, fon büyüklüğü ve tahmini pozisyon (ağırlık x büyüklük)
export const tickerFunds = cached(async (ticker: string): Promise<{ code: string; name: string; kind: string; weight: number; size: number | null; amount: number | null }[]> => (await pool.query(
  `SELECT h.code, i.name, i.kind, h.weight, i.size, h.weight / 100 * i.size AS amount FROM holdings h
   JOIN LATERAL (SELECT name, kind, size FROM info WHERE code = h.code ORDER BY date DESC LIMIT 1) i ON true
   WHERE h.ticker = $1 ORDER BY amount DESC NULLS LAST`,
  [ticker],
)).rows, (t) => t);
