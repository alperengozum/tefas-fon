// TEFAS yeni JSON API'sinden (auth'suz) fon verisi çeker: node scripts/ingest.mjs [gün=400]
import pg from "pg";
import { readFileSync } from "node:fs";

const BASE = "https://www.tefas.gov.tr/api/funds/";
const KINDS = ["YAT", "EMK", "BYF", "GYF", "GSYF"];
const HDR = {
  Accept: "*/*", "Content-Type": "application/json", Origin: "https://www.tefas.gov.tr",
  Referer: "https://www.tefas.gov.tr/tr/fon-verileri",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
if (process.argv[2] === "init") { await db.end(); process.exit(0); } // sadece şema
if (process.argv[2] === "vol") { await computeVol(); await db.end(); process.exit(0); } // sadece volatilite

// ponytail: sabit 11sn aralık (TEFAS: dk'da 6 istek), hatada 65sn bekle. İstek başı max ~1 ay.
let last = 0;
async function post(endpoint, kind, start, end) {
  const body = {
    fonTipi: kind, fonKodu: null, aramaMetni: null, fonTurKod: null, fonGrubu: null, sfonTurKod: null,
    fonTurAciklama: null, kurucuKod: null, basTarih: ymd(start).replaceAll("-", ""), bitTarih: ymd(end).replaceAll("-", ""),
    basSira: 1, bitSira: 100000, dil: "TR", sFonTurKod: "", fonKod: "", fonGrup: "", fonUnvanTip: "",
  };
  for (let i = 0; i < 5; i++) {
    await sleep(Math.max(0, 11000 - (Date.now() - last)));
    last = Date.now();
    try {
      const res = await fetch(BASE + endpoint, { method: "POST", headers: HDR, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      const d = await res.json();
      const msg = (d.errorMessage ?? "").toLowerCase();
      if (msg && !msg.includes("out of bounds") && !msg.includes("bulunamad")) throw new Error(msg);
      return d.resultList ?? [];
    } catch (e) {
      console.log("  hata, tekrar:", e.message);
      await sleep(65000);
    }
  }
  throw new Error("TEFAS yanıt vermiyor");
}

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
  let cur = max ? addDays(new Date(max), 1) : addDays(today, -days);
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
    const data = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => typeof v === "number" && v && k !== "rn")));
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
await db.end();
