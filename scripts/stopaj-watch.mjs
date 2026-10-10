// Stopaj bekçisi: node scripts/stopaj-watch.mjs [ilk çalıştırmada Resmi Gazete'de geriye gün=30]
// 1) Resmi Gazete fihristini günlük tarar, yatırım fonu stopajını düzenleyen (GVK geçici 67) kararları kaydeder (stopaj_karar).
// 2) Portföy şirketi / banka stopaj tablolarını okur (scripts/stopaj-sources.mjs); geçmişle tutarlı bir kaynak yeni bir alış dönemi
//    gösterirse satırı stopaj_rule'a yazar, site bunu src/lib/stopaj-rules.mjs tablosuyla birleştirir. Şüphede (çelişen ya da
//    ayrışan kaynaklar) hiçbir şey yazılmaz, mevcut oranlar geçerli kalır. Anahtar/token gerekmez.
// 3) Bekleyen kararı kaynaklarda yeni dönem çıkınca "uygulandi", 30 gün çıkmazsa "etkisiz" sayar (ör. yalnız kurumları ilgilendiren karar).
import pg from "pg";
import { readFileSync } from "node:fs";
import { fetchDay, parseFihrist } from "./resmigazete.mjs";
import { decide } from "./stopaj-sources.mjs";
import { KNOWN_KARARLAR, mergeRules, STOPAJ_RULES } from "../src/lib/stopaj-rules.mjs";

// STOPAJ_SOURCES: test için kaynak listesi modülü (varsayılan gerçek kaynaklar)
const { SOURCES } = await import(process.env.STOPAJ_SOURCES ?? "./stopaj-sources.mjs");
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
const log = (...a) => console.log("stopaj:", ...a);

// 1) Resmi Gazete
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const today = ymd(Date.now() + 3 * 3600e3); // TR günü (UTC+3); konteynerde tzdata yok
const { rows: [{ last }] } = await db.query("SELECT max(day)::text AS last FROM rg_scanned");
for (let day = last ? ymd(Date.parse(last) + 864e5) : ymd(Date.parse(today) - Number(process.argv[2] ?? 30) * 864e5); day <= today; day = ymd(Date.parse(day) + 864e5)) {
  let pages;
  try { pages = await fetchDay(day); } catch (e) { log("Resmi Gazete taraması durdu", day, e.message); break; } // sonraki çalışmada bu günden devam
  for (const p of pages)
    for (const k of parseFihrist(p.html, p.url)) {
      const { rowCount } = await db.query("INSERT INTO stopaj_karar (karar, day, title, url, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (karar) DO NOTHING",
        [k.karar, day, k.title, k.url, KNOWN_KARARLAR.has(k.karar) ? "bilinen" : "bekliyor"]);
      if (rowCount && !KNOWN_KARARLAR.has(k.karar)) log(`yeni karar ${k.karar} (${day}): ${k.title} ${k.url}`);
    }
  await db.query("INSERT INTO rg_scanned VALUES ($1) ON CONFLICT DO NOTHING", [day]);
}

// 2) Kaynaklar
const { rows: auto } = await db.query(`SELECT "from"::text, a, b, serbest_hy FROM stopaj_rule ORDER BY "from"`);
const rules = mergeRules(STOPAJ_RULES, auto.map((r) => ({ from: r.from, a: r.a, b: r.b, serbestHisseYogun: r.serbest_hy })));
const results = [];
for (const s of SOURCES) {
  try { results.push({ name: s.name, rows: await s.rows() }); } catch (e) { results.push({ name: s.name, error: e.message }); }
}
const d = decide(results, rules);
for (const l of d.log) log(l);
for (const r of d.apply) {
  await db.query(`INSERT INTO stopaj_rule ("from", a, b, serbest_hy, source) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT ("from") DO UPDATE SET a = EXCLUDED.a, b = EXCLUDED.b, serbest_hy = EXCLUDED.serbest_hy, source = EXCLUDED.source, added = now()`,
    [r.from, r.a, r.b, r.serbestHisseYogun, d.source]);
  log(`UYGULANDI: ${r.from} ve sonrası alımlar a=%${r.a * 100} b=%${r.b * 100} serbest hisse yoğun=%${r.serbestHisseYogun * 100} (${d.source})`);
}

// 3) Bekleyen kararlar
if (d.apply.length) await db.query("UPDATE stopaj_karar SET status = 'uygulandi' WHERE status = 'bekliyor'");
const { rows: stale } = await db.query("UPDATE stopaj_karar SET status = 'etkisiz' WHERE status = 'bekliyor' AND day < $1::date - 30 RETURNING karar", [today]);
for (const k of stale) log(`karar ${k.karar}: 30 gündür kaynaklarda yeni dönem yok, gerçek kişi fon oranını etkilemediği varsayıldı`);
const { rows: waiting } = await db.query("SELECT karar, day::text FROM stopaj_karar WHERE status = 'bekliyor' ORDER BY day");
for (const k of waiting) log(`karar ${k.karar} (${k.day}) bekliyor: kaynaklarda henüz yeni dönem yok`);
await db.end();
