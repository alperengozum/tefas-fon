// KAP hisse portföylerindeki BIST hisselerinin günlük düzeltilmiş kapanışları (Yahoo Finance, auth'suz): node scripts/stocks.mjs
// Aralık: holdings_hist'teki en eski rapor döneminden 10 gün önce (en çok 2 yıl) -> bugün. adjclose temettü/bölünme sonrası
// geriye dönük değiştiği için her çalışmada aralığın tamamı yeniden yazılır. ~520 hisse x ~150ms + bekleme ≈ 3 dk.
import pg from "pg";
import { readFileSync } from "node:fs";
import { HDR, ymd } from "./tefas.mjs";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { rows: [{ min }] } = await db.query("SELECT min(period)::text AS min FROM holdings_hist");
const { rows: tickers } = await db.query("SELECT DISTINCT ticker FROM holdings_hist UNION SELECT DISTINCT ticker FROM holdings ORDER BY 1");
if (!min || !tickers.length) { console.log("hisse portföyü yok, atlandı"); await db.end(); process.exit(0); }
const floor = Date.now() - 730 * 864e5;
const from = Math.floor(Math.max(new Date(min).getTime() - 10 * 864e5, floor) / 1000), to = Math.floor(Date.now() / 1000) + 86400;

let ok = 0;
const missing = [];
for (const { ticker } of tickers) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.IS?period1=${from}&period2=${to}&interval=1d&events=div,split`,
      { headers: { "User-Agent": HDR["User-Agent"] }, signal: AbortSignal.timeout(20000) });
    if (res.status === 429) { await sleep(30000); missing.push(ticker); continue; }
    const r = (await res.json()).chart?.result?.[0];
    const close = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close;
    if (!r?.timestamp || !close) { missing.push(ticker); continue; }
    // gün başına tek kayıt (Yahoo gün içi + kapanış verebiliyor: sonuncu kalır)
    const days = [...new Map(r.timestamp.map((t, i) => [ymd(new Date((t + r.meta.gmtoffset) * 1000)), close[i]]).filter(([, v]) => v > 0))];
    await db.query(
      `INSERT INTO stock_px SELECT $1, * FROM unnest($2::date[], $3::float8[]) ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close`,
      [ticker, days.map((d) => d[0]), days.map((d) => d[1])],
    );
    ok++;
  } catch (e) {
    missing.push(ticker);
  }
  await sleep(150);
}
// hisse portföylerinden çıkmış ve artık hiçbir raporda geçmeyen hisselerin fiyatları
await db.query("DELETE FROM stock_px s WHERE NOT EXISTS (SELECT 1 FROM holdings_hist h WHERE h.ticker = s.ticker) AND NOT EXISTS (SELECT 1 FROM holdings h WHERE h.ticker = s.ticker)");
console.log(`hisse fiyatları: ${ok}/${tickers.length}${missing.length ? `, bulunamayan: ${missing.slice(0, 30).join(" ")}${missing.length > 30 ? " …" : ""}` : ""}`);
await db.end();
