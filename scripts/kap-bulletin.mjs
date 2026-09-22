// SPK Kurul Bülteni ile toplu tasfiyeye çıkarılan fonlar: bu karar PYŞ'nin kendi KAP bildirimi değil, Kurul'un
// doğrudan kararı olduğundan fon bazlı KAP akışında (holdings.mjs'nin taradığı funds/byCriteria) hiç görünmüyor
// (örnek: THF + 130 fon, 17.09.2026 tarih 2026/60 sayılı Bülten — KAP'ta "Fon Tasfiye Duyurusu" bildirimi hiç yok).
// Bülten metnindeki kod listesi elle buraya verilip kap_notif'e işlenir; aktif/pasif hesabı (db.ts) bunu otomatik okur.
// kullanım: node scripts/kap-bulletin.mjs 2026-09-17 "BHN, BYZ, CBD, ..."
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [date, codesArg] = process.argv.slice(2);
if (!date || !codesArg) {
  console.error('kullanım: node scripts/kap-bulletin.mjs 2026-09-17 "KOD1, KOD2, ..."');
  process.exit(1);
}
const codes = [...new Set(codesArg.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
const { rows: known } = await db.query("SELECT DISTINCT ON (code) code, name FROM info ORDER BY code, date DESC");
const names = new Map(known.map((r) => [r.code, r.name]));
const missing = codes.filter((c) => !names.has(c));
const found = codes.filter((c) => names.has(c));
if (missing.length) console.log("TEFAS'ta bulunamayan kodlar (atlandı, yazım hatası olabilir):", missing.join(", "));

// disclosure_index KAP'ın kendi (pozitif) ID uzayıyla asla çakışmasın diye negatif; (tarih, kod) çiftinden türetilir
// ki script tekrar çalıştırılınca (ON CONFLICT DO NOTHING) yinelenmesin.
const idx = (c) => -parseInt(createHash("sha1").update(`bulletin:${date}:${c}`).digest("hex").slice(0, 7), 16);

if (found.length)
  await db.query(
    `INSERT INTO kap_notif SELECT * FROM unnest($1::int[], $2::text[], $3::timestamptz[], $4::text[], $5::text[]) ON CONFLICT (disclosure_index) DO NOTHING`,
    [found.map(idx), found, found.map(() => `${date}T18:00:00+03:00`), found.map(() => "Fon Tasfiye Duyurusu"), found.map((c) => names.get(c))],
  );
console.log(`${found.length} fon kap_notif'e eklendi (Kurul Bülteni, ${date}).`);
await db.end();
