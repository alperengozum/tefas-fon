// TEFAS yeni JSON API'sinden (auth'suz) fon verisi çeker: node scripts/ingest.mjs [gün=400]
import pg from "pg";
import { readFileSync } from "node:fs";
import { HDR, allocData, post, ymd } from "./tefas.mjs";

const KINDS = ["YAT", "EMK", "BYF", "GYF", "GSYF"];
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
if (process.argv[2] === "init") { await db.end(); process.exit(0); } // sadece şema
if (process.argv[2] === "vol") { await computeVol(); await db.end(); process.exit(0); } // sadece volatilite
if (process.argv[2] === "bench") { await fetchBench(); await db.end(); process.exit(0); } // sadece benchmark

// Yıllık volatilite: son 1 yılın günlük getiri std sapması x sqrt(252). Tüm fonlar tek geçişte, listeleme sayfası sadece okur.
async function computeVol() {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL work_mem = '64MB'"); // sıralama diske taşmasın
    await c.query(`INSERT INTO fund_vol (code, vol, updated)
      SELECT code, stddev_samp(r) * sqrt(252) * 100, CURRENT_DATE FROM (
        SELECT code, price / NULLIF(lag(price) OVER (PARTITION BY code ORDER BY date), 0) - 1 AS r
        FROM info WHERE date > (SELECT max(date) FROM info) - 365) t
      WHERE r IS NOT NULL GROUP BY code HAVING count(*) > 20
      ON CONFLICT (code) DO UPDATE SET vol = EXCLUDED.vol, updated = EXCLUDED.updated`);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  console.log("volatilite güncellendi");
}

// Benchmark: BIST100, USD/TRY ve gram altın (ons altın x USD/TRY / 31,1035) günlük kapanışları, Yahoo Finance'ten (auth'suz).
async function yahoo(sym) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d`, { headers: { "User-Agent": HDR["User-Agent"] }, signal: AbortSignal.timeout(30000) });
  const r = (await res.json()).chart?.result?.[0];
  if (!r) throw new Error("Yahoo boş yanıt: " + sym);
  const c = r.indicators.quote[0].close;
  // Yahoo aynı güne iki bar verebiliyor (ör. gün içi + kapanış): tarihe göre tekilleştir, sonuncusu kalır (INSERT tek satıra iki kez yazamaz)
  return [...new Map(r.timestamp.map((t, i) => [ymd(new Date((t + r.meta.gmtoffset) * 1000)), c[i]]).filter(([, v]) => v > 0))];
}
async function fetchBench() {
  try {
    const [bist, usd, gold] = await Promise.all(["XU100.IS", "USDTRY=X", "GC=F"].map(yahoo));
    let u = 0, i = 0;
    const gram = gold.flatMap(([d, g]) => { while (i < usd.length && usd[i][0] <= d) u = usd[i++][1]; return u ? [[d, (g * u) / 31.1035]] : []; });
    for (const [sym, rows] of [["BIST100", bist], ["USD", usd], ["ALTIN", gram]])
      await db.query(
        `INSERT INTO bench SELECT $1, * FROM unnest($2::date[], $3::float8[]) ON CONFLICT (sym, date) DO UPDATE SET price = EXCLUDED.price`,
        [sym, rows.map((r) => r[0]), rows.map((r) => r[1])],
      );
    console.log("benchmark güncellendi");
  } catch (e) { console.log("benchmark alınamadı:", e.message); } // ana ingest'i düşürmesin
}

async function save(kind, rows) {
  if (!rows.length) return;
  await db.query(
    `INSERT INTO info (kind, code, name, date, price, shares, investors, size)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::date[], $5::float8[], $6::float8[], $7::int[], $8::float8[])
     ON CONFLICT (code, date) DO UPDATE SET price=EXCLUDED.price, shares=EXCLUDED.shares, investors=EXCLUDED.investors, size=EXCLUDED.size`,
    [kind, ...["fonKodu", "fonUnvan", "tarih", "fiyat", "tedPaySayisi", "kisiSayisi", "portfoyBuyukluk"].map((k) => rows.map((r) => r[k]))],
  );
}

const days = Number(process.argv[2] ?? 400);
const today = new Date();
for (const kind of KINDS) {
  const { rows: [{ max }] } = await db.query("SELECT max(date)::text FROM info WHERE kind=$1", [kind]);
  // son günü de yeniden çek: 10:00'da açıklamayan fonlar 12:00 turunda aynı tarihe eklensin (upsert)
  let cur = max ? new Date(max) : addDays(today, -days);
  while (cur <= today) {
    const end = new Date(Math.min(addDays(cur, 27), today));
    const rows = await post("fonGnlBlgSiraliGetir", kind, cur, end);
    await save(kind, rows);
    console.log(kind, ymd(cur), ymd(end), rows.length);
    cur = addDays(end, 1);
  }
  // varlık dağılımı: son iş günü
  const { rows: [{ d }] } = await db.query("SELECT max(date)::text d FROM info WHERE kind=$1", [kind]);
  if (d) {
    const rows = await post("dagilimSiraliGetirT", kind, new Date(d), new Date(d));
    const data = rows.map(allocData);
    if (rows.length)
      await db.query(
        `INSERT INTO alloc SELECT * FROM unnest($1::text[], $2::date[], $3::jsonb[])
         ON CONFLICT (code) DO UPDATE SET date=EXCLUDED.date, data=EXCLUDED.data`,
        [rows.map((r) => r.fonKodu), rows.map(() => d), data.map((x) => JSON.stringify(x))],
      );
    console.log(kind, "dağılım", d, rows.length);
  }
}

// Uzun vade getirileri (2Y/3Y/5Y) için tüm geçmişi çekmek yerine sadece hedef tarih çevresindeki 1 haftalık pencere.
// Her çalışmada hedef tarih kaydığı için pencere yoksa çekilir (idempotent).
for (const kind of KINDS) {
  for (const n of [730, 1095, 1825]) {
    const target = addDays(today, -n);
    // TEFAS: başlangıç tarihi 5 takvim yılından eski olamaz
    const limit = new Date(today); limit.setFullYear(limit.getFullYear() - 5);
    const from = new Date(Math.max(addDays(target, -6), limit));
    const { rows: [{ c }] } = await db.query("SELECT count(*)::int c FROM info WHERE kind=$1 AND date BETWEEN $2 AND $3", [kind, ymd(from), ymd(target)]);
    if (c) continue;
    const rows = await post("fonGnlBlgSiraliGetir", kind, from, target);
    await save(kind, rows);
    console.log(kind, "anchor", n, ymd(from), ymd(target), rows.length);
  }
}
await computeVol();
await fetchBench();
await db.end();
