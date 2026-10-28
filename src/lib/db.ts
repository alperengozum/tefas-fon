import pg from "pg";
import { classify, fold, riskOf } from "./classify";
import { median } from "./stats";
import { diffHoldings, type HoldDiff } from "./holdingsDiff";
import { cached as lru } from "./cache";
import { mergeRules, STOPAJ_RULES } from "./stopaj-rules.mjs";

type StopajRule = (typeof STOPAJ_RULES)[number];

// Prod'da (Docker NODE_ENV=production) varsayılan tefas:tefas parolasına düşmesin.
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas",
});

export type Fund = {
  code: string; kind: string; name: string; price: number; size: number; investors: number;
  stock: number; active: boolean; alloc: Record<string, number> | null; // alloc: varlık dağılımı (%)
  founder: string; type: string; fx: boolean; islamic: boolean; qualified: boolean; stockFocus: boolean; oks: boolean;
  vol: number | null; risk: number | null; mdd: number | null; // mdd: son 1 yıl en büyük düşüş (%)
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
  // referans: vade günü ve önceki ACTIVE_DAYS içinde fiyatı açıklanmış (≠0) son gün; o gün 0/boşsa getiri "–" kalmasın
  const joins = keys.map((k) => `LEFT JOIN LATERAL (SELECT price, shares FROM info o WHERE o.code = c.code
    AND o.date <= (SELECT d FROM pd WHERE k='${k}') AND o.date > (SELECT d FROM pd WHERE k='${k}') - ${ACTIVE_DAYS}
    AND o.price > 0 ORDER BY o.date DESC LIMIT 1) o_${k} ON true`).join("\n");
  // pasif fonun son fiyatı eski olduğundan güncel vadelerle kıyaslanamaz: getiri/akış boş. Fiyat 0 = açıklanmadı: yine boş
  const rets = keys.map((k) => `CASE WHEN c.date >= ref.d - ${ACTIVE_DAYS} THEN (NULLIF(c.price, 0) / NULLIF(o_${k}.price, 0) - 1) * 100 END AS ${k}`).join(", ");
  const flows = FLOWS.map((k) => `CASE WHEN c.date >= ref.d - ${ACTIVE_DAYS} THEN (c.shares - o_${k}.shares) * NULLIF(c.price, 0) END AS flow_${k}`).join(", ");
  const { rows } = await pool.query(
    // k: fon kodları (recursive skip scan), last: fon başına son veri günü. GROUP BY tüm tabloyu tarıyordu, bu ~3x hızlı.
    `WITH RECURSIVE ref AS (SELECT max(date) d FROM info), pd AS (${dates}),
     k AS (SELECT min(code) code FROM info UNION ALL SELECT (SELECT min(code) FROM info WHERE code > k.code) FROM k WHERE k.code IS NOT NULL),
     last AS (SELECT code, (SELECT max(date) FROM info WHERE info.code = k.code) d FROM k WHERE code IS NOT NULL),
     liq AS (SELECT DISTINCT code FROM kap_notif WHERE subject = 'Fon Tasfiye Duyurusu')
     SELECT c.code, c.kind, c.name, c.price, c.size, c.investors, ref.d::text AS ref,
            (c.date >= ref.d - ${ACTIVE_DAYS} AND liq.code IS NULL) AS active,
            a.data AS alloc, COALESCE((a.data->>'hs')::float8, 0) AS stock, v.vol, v.mdd, ${rets}, ${flows}
     FROM last JOIN info c ON c.code = last.code AND c.date = last.d CROSS JOIN ref
     ${joins}
     LEFT JOIN alloc a ON a.code = c.code
     LEFT JOIN fund_vol v ON v.code = c.code
     LEFT JOIN liq ON liq.code = c.code
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

// Veri yalnız crawler script'leri (start.sh döngüsü, günde ~2 kez) yazınca değişir; her script bitince data_version'ı damgalar
// (scripts/schema.mjs bumpVersion). Web süreci damgaya dakikada bir bakar (tek PK sorgusu); değiştiyse önbellekteki her kaydı
// arkada sırayla yeniden çeker, yenisi gelene kadar eskisi döner: kullanıcı crawler sonrası soğuk okumaya denk gelmez.
// Açılışta en çok yatırımcılı fonlar ısıtılır. TTL yalnız damga okunamazsa diye güvenlik ağı (10:00/12:00 arası en uzun boşluk 22 sa).
const TTL = 26 * 3600_000;
const WARM_TOP = 100;
const onDataChange: (() => Promise<void>)[] = [];
let version: string | null = null, warming: Promise<void> | null = null, again = false;
function warm() {
  if (warming) { again = true; return; } // yenileme sürerken yeni damga: bitince bir tur daha
  warming = (async () => {
    do { again = false; for (const f of onDataChange) await f().catch(() => {}); } while (again);
  })().finally(() => (warming = null));
}
async function warmTop() {
  const { rows } = await pool.query(`SELECT code FROM info WHERE date = (SELECT max(date) FROM info) ORDER BY investors DESC NULLS LAST LIMIT ${WARM_TOP}`);
  for (const { code } of rows) await getFund(code).catch(() => {});
}
setInterval(() => {
  pool.query(`SELECT at::text FROM data_version WHERE id = 1`).then(({ rows }) => {
    const v = rows[0]?.at ?? "";
    if (version === null) warmTop().catch(() => {});
    else if (v !== version) warm();
    version = v;
  }).catch(() => {});
}, 60_000).unref();

// Liste sorgusu ağır (10 join + jsonb). Tür başına bellek önbelleği, süresi dolunca eski sonuç hemen döner ve arkada yenilenir
// (stale-while-revalidate): kullanıcı sorguyu asla beklemez (ilk yükleme hariç). Veri değişince warm() da yeniler.
type Listed = { ref: string; funds: Fund[] };
const cache = new Map<string, { t: number; p: Promise<Listed>; refreshing?: boolean }>();
onDataChange.push(async () => {
  for (const kind of [...cache.keys()]) cache.set(kind, { t: Date.now(), p: Promise.resolve(await queryFunds(kind)) });
});
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

const cached = <A extends unknown[], T>(fn: (...a: A) => Promise<T>, key: (...a: A) => string, max?: number) => {
  const c = lru(fn, key, TTL, max);
  onDataChange.push(c.refresh);
  return c as (...a: A) => Promise<T>;
};

export type Detail = {
  code: string; name: string; kind: string;
  history: { date: string; price: number; size: number; investors: number; shares: number }[];
  alloc: Record<string, number>; allocDate: string | null;
  active?: boolean; tasfiye?: string | null; allocKap?: boolean; // sadece getFund doldurur
};

// Fon başına fiyat geçmişi (~1250 satır, ~190 KB). Ağır okuma bu; getFund ve getFunds kendileri önbelleklenmez, bu kaydı
// paylaşır: her yeni fon kombinasyonu (portföy, karşılaştırma, rakip tablosu) sıcak fonları yeniden okumaz ve diziler yalnız
// burada tutulur (en fazla 250 fon ≈ 50 MB). Ad/tür satır başına değil, son satırdan bir kez.
const historyOf = cached(async (code: string): Promise<{ kind: string; name: string; history: Detail["history"] }> => {
  const [h, last] = await Promise.all([
    pool.query(`SELECT date::text, price, size, investors, shares FROM info WHERE code=$1 ORDER BY date`, [code]),
    pool.query(`SELECT kind, name FROM info WHERE code=$1 ORDER BY date DESC LIMIT 1`, [code]),
  ]);
  return { kind: last.rows[0]?.kind ?? "", name: last.rows[0]?.name ?? "", history: h.rows };
}, (code) => code, 250);

// hisse portföyü varsa varlık dağılımı da KAP raporunun dönem sonundan (aynı güne ait olsun), yoksa son iş günü
const fundMeta = cached(async (code: string) => {
  const [a, liq] = await Promise.all([
    pool.query(`SELECT COALESCE(m.alloc_date, a.date)::text AS date, COALESCE(m.alloc, a.data) AS data, m.alloc IS NOT NULL AS kap
      FROM alloc a LEFT JOIN holdings_meta m ON m.code = a.code WHERE a.code=$1`, [code]),
    pool.query(`SELECT min(published)::text AS d FROM kap_notif WHERE code=$1 AND subject='Fon Tasfiye Duyurusu'`, [code]),
  ]);
  return { alloc: a.rows[0]?.data ?? {}, allocDate: a.rows[0]?.date ?? null, allocKap: a.rows[0]?.kap ?? false, tasfiye: (liq.rows[0]?.d ?? null) as string | null };
}, (code) => code);
const activeFrom = cached(async (): Promise<string> => (await pool.query(`SELECT (max(date) - ${ACTIVE_DAYS})::text AS min FROM info`)).rows[0].min, () => "a");

export async function getFund(code: string): Promise<Detail | null> {
  const [{ kind, name, history }, m, min] = await Promise.all([historyOf(code), fundMeta(code), activeFrom()]);
  if (!history.length) return null;
  return { code, name, kind, history, ...m, active: history[history.length - 1].date >= min && !m.tasfiye };
}

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
  return { holdings: h.rows, report: m.rows[0]?.report ?? null, published: m.rows[0]?.published ?? null, note: m.rows[0]?.note ?? null, seen: (m.rowCount ?? 0) > 0 };
}, (code) => code);

export type Notif = { disclosure_index: number; published: string; subject: string; url: string | null };

// Fon başına son KAP bildirimleri (tüm türler); tıklanınca KAP'taki bildirim sayfasına gider.
export async function getNews(code: string, limit = 10): Promise<Notif[]> {
  const { rows } = await pool.query(
    `SELECT disclosure_index, published::text, subject, url FROM kap_notif WHERE code=$1 ORDER BY published DESC LIMIT $2`,
    [code, limit],
  );
  return rows;
}

// Hisse filtresi: `ticker`ı en az `min` % ağırlıkla tutan fonlar -> {kod: ağırlık}
export const fundsHolding = cached(async (ticker: string, min: number): Promise<Record<string, number>> => {
  const { rows } = await pool.query(`SELECT code, weight FROM holdings WHERE ticker=$1 AND weight >= $2`, [ticker, min]);
  return Object.fromEntries(rows.map((r) => [r.code, r.weight]));
}, (ticker, min) => `${ticker}|${min}`);

// Karşılaştırma için toplu okuma: geçmiş fon başına önbellekten (historyOf), dağılım ve hisseler toplu 2 ucuz sorgu (PK).
// Kombinasyon önbelleklenmez: anahtar her kullanıcıda farklı (ıskalar) ve geçmiş dizilerini historyOf sınırı dışında tutardı.
export async function getFunds(codes: string[]): Promise<{ funds: Detail[]; holdings: Map<string, Holding[]> }> {
  if (!codes.length) return { funds: [], holdings: new Map() };
  const [hs, a, hl] = await Promise.all([
    Promise.all(codes.map((c) => historyOf(c))),
    pool.query(`SELECT code, date::text, data FROM alloc WHERE code = ANY($1)`, [codes]),
    pool.query(`SELECT code, ticker, weight FROM holdings WHERE code = ANY($1) ORDER BY weight DESC`, [codes]),
  ]);
  const alloc = new Map(a.rows.map((r) => [r.code, r]));
  const holdings = new Map<string, Holding[]>();
  for (const r of hl.rows) (holdings.get(r.code) ?? holdings.set(r.code, []).get(r.code)!).push({ ticker: r.ticker, weight: r.weight });
  const funds = codes.flatMap((code, i) => hs[i].history.length
    ? [{ code, name: hs[i].name, kind: hs[i].kind, history: hs[i].history, alloc: alloc.get(code)?.data ?? {}, allocDate: alloc.get(code)?.date ?? null } as Detail]
    : []);
  return { funds, holdings };
}

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
// Fonun son iki KAP raporu arasında hisse değişimleri (holdings_hist). Tek rapor varsa null.
export const getHoldingsChange = cached(async (code: string): Promise<{ cur: string; prev: string; diff: HoldDiff } | null> => {
  const { rows } = await pool.query(
    `WITH p AS (SELECT DISTINCT period, report FROM holdings_hist WHERE code=$1 ORDER BY period DESC LIMIT 2)
     SELECT p.period::text, p.report, h.ticker, h.weight FROM p JOIN holdings_hist h ON h.code=$1 AND h.period=p.period`, [code]);
  const periods = [...new Set(rows.map((r) => r.period))].sort().reverse();
  if (periods.length < 2) return null;
  const at = (p: string) => rows.filter((r) => r.period === p).map((r) => ({ ticker: r.ticker, weight: r.weight }));
  return { cur: rows.find((r) => r.period === periods[0]).report, prev: rows.find((r) => r.period === periods[1]).report, diff: diffHoldings(at(periods[1]), at(periods[0])) };
}, (code) => code);

// Bir hissenin fonlardaki son iki rapor ağırlığı: { kod: { prev, cur } } (cur null = son raporda çıkarmış). Geçmişi tek rapor olan fon yok.
export const tickerChanges = cached(async (ticker: string): Promise<Record<string, { prev: number | null; cur: number | null; name: string }>> => {
  const { rows } = await pool.query(
    `WITH p AS (SELECT code, period, row_number() OVER (PARTITION BY code ORDER BY period DESC) rn FROM (SELECT DISTINCT code, period FROM holdings_hist) t),
     touched AS (SELECT DISTINCT code FROM holdings_hist WHERE ticker=$1)
     SELECT p1.code, cur.weight AS cur, prev.weight AS prev, i.name FROM p p1
     JOIN touched USING (code)
     JOIN p p2 ON p2.code = p1.code AND p2.rn = 2
     LEFT JOIN holdings_hist cur ON cur.code = p1.code AND cur.period = p1.period AND cur.ticker = $1
     LEFT JOIN holdings_hist prev ON prev.code = p1.code AND prev.period = p2.period AND prev.ticker = $1
     JOIN LATERAL (SELECT name FROM info WHERE code = p1.code ORDER BY date DESC LIMIT 1) i ON true
     WHERE p1.rn = 1 AND (cur.weight IS NOT NULL OR prev.weight IS NOT NULL)`, [ticker]);
  return Object.fromEntries(rows.map((r) => [r.code, { prev: r.prev, cur: r.cur, name: r.name }]));
}, (t) => t);

export const tickerFunds = cached(async (ticker: string): Promise<{ code: string; name: string; kind: string; weight: number; size: number | null; amount: number | null }[]> => (await pool.query(
  `SELECT h.code, i.name, i.kind, h.weight, i.size, h.weight / 100 * i.size AS amount FROM holdings h
   JOIN LATERAL (SELECT name, kind, size FROM info WHERE code = h.code ORDER BY date DESC LIMIT 1) i ON true
   WHERE h.ticker = $1 ORDER BY amount DESC NULLS LAST`,
  [ticker],
)).rows, (t) => t);

// Stopaj kuralları: koddaki tablo + kaynaklardan otomatik eklenen dönemler (stopaj_rule). Tablo yoksa (eski şema) koddaki tablo.
export const getStopajRules = cached(async (): Promise<{ rules: StopajRule[]; auto: { from: string; source: string }[] }> => {
  const { rows } = await pool.query(`SELECT "from"::text, a, b, serbest_hy, source FROM stopaj_rule ORDER BY "from"`).catch(() => ({ rows: [] as any[] }));
  return {
    rules: mergeRules(STOPAJ_RULES, rows.map((r) => ({ from: r.from, a: r.a, b: r.b, serbestHisseYogun: r.serbest_hy }))),
    auto: rows.map((r) => ({ from: r.from, source: r.source })),
  };
}, () => "s");

// Risksiz getiri yaklaşığı (Sharpe/Sortino için, yıllık oran): aktif TL para piyasası fonlarının 1Y getiri medyanı.
// ponytail: TLREF/politika faizi serisi yok; PPF'ler gecelik faizi yakından izlediği için yeterli. Veri yoksa null.
export async function riskFree(): Promise<number | null> {
  const { funds } = await listFunds("YAT");
  const m = median(funds.filter((f) => f.active && f.type === "Para Piyasası" && !f.fx && f.y1 != null).map((f) => f.y1!));
  return m == null ? null : m / 100;
}

// Fonlarda geçen tüm hisse kodları (arama kutusunda öneri için)
export const allTickers = cached(async (): Promise<string[]> =>
  (await pool.query(`SELECT DISTINCT ticker FROM holdings ORDER BY ticker`)).rows.map((r) => r.ticker),
() => "a");
