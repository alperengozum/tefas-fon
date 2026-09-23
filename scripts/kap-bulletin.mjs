// SPK Kurul Bülteni taraması: node scripts/kap-bulletin.mjs
//
// SPK'nın kendi kararıyla (PYŞ'nin kendi duyurusu değil) toplu tasfiyeye çıkardığı fonlar KAP'ın fon bazlı
// bildirim akışında (holdings.mjs'nin taradığı funds/byCriteria) hiç görünmüyor — canlı KAP API'sine karşı
// doğrulandı: THF + 130 fonun (17.09.2026, Kurul Bülteni 2026/60+61) hiçbirinde "tasfiye" geçen tek bildirim yok.
// Karar SPK'nın kendi haftalık Kurul Bülteni'nde (spk.gov.tr) PDF olarak yayımlanıyor; ayrı bir kod (KOD) listesi
// yerine sadece fon UNVANI geçiyor, bu yüzden TEFAS'taki bilinen fon adlarıyla (info tablosu) eşleştiriyoruz:
// bültenin ilgili bölümünü ayrıştırmak yerine (sayfa düzeni/numaralama bültenden bültene değişebiliyor, kırılgan),
// PDF metninde hangi bilinen fon adlarının (harfiyen) geçtiğine bakıyoruz — "tasfiye ettirilmesine" ibaresi
// geçmeyen bültenlerde hiç aramıyoruz, o yüzden alakasız bültenlerde yanlış eşleşme riski yok.
import pg from "pg";
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const HDR = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36" };
const squash = (s) => s.replace(/\s+/g, " ").trim();

async function pdfText(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) out += " " + (await (await doc.getPage(p)).getTextContent()).items.map((it) => it.str).join(" ");
  return squash(out);
}

async function main() {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
  await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));

  // bülten listesi yıl başına ayrı sayfa; olası yıl geçişinde bir önceki yılın son bültenleri de hâlâ o sayfada kalabilir
  const year = new Date().getFullYear();
  const listHtml = await (await fetch(`https://spk.gov.tr/spk-bultenleri/${year}-yili-spk-bultenleri`, { headers: HDR })).text();
  const bulletins = [...listHtml.matchAll(/href="(https:\/\/spk\.gov\.tr\/data\/[^"]+\/(\d{4}-\d+)\.pdf)"/g)]
    .map((m) => ({ url: m[1], no: m[2] }));
  if (!bulletins.length) { console.log("bülten listesi okunamadı ya da boş"); await db.end(); return; }

  // url kolonu sonradan eklendi: fonu eşleşmiş ama url'i boş kalmış bültenler bir kereliğine yeniden taranır
  const { rows: scanned } = await db.query(
    `SELECT no FROM spk_bulten_scanned s WHERE NOT EXISTS (SELECT 1 FROM kap_notif WHERE url IS NULL
       AND disclosure_index BETWEEN -replace(s.no, '-', '')::int * 1000 - 999 AND -replace(s.no, '-', '')::int * 1000)`);
  const done = new Set(scanned.map((r) => r.no));
  // son 2 bülten her seferinde yeniden taranır (yayınlandıktan sonra bir süre güncellenebiliyor, örn. "listesi güncellenmiştir")
  const todo = bulletins.filter((b, i) => !done.has(b.no) || i < 2);
  if (!todo.length) { console.log("yeni bülten yok"); await db.end(); return; }

  const { rows: known } = await db.query("SELECT DISTINCT ON (code) code, name FROM info ORDER BY code, date DESC");
  const names = known.map((r) => ({ code: r.code, name: squash(r.name) })).filter((r) => r.name.length > 8);

  for (const b of todo) {
    const buf = Buffer.from(await (await fetch(b.url, { headers: HDR })).arrayBuffer());
    const text = await pdfText(buf);
    if (/tasfiye ettirilmesine/i.test(text)) {
      const dateM = text.match(/BÜLTENİ\s+\d{4}\/\d+\s+(\d{2}\/\d{2}\/\d{4})/);
      const published = dateM ? dateM[1].split("/").reverse().join("-") + "T18:00:00+03:00" : new Date().toISOString();
      const matched = names.filter((r) => text.includes(r.name));
      if (matched.length) {
        const base = -(parseInt(b.no.replace("-", ""), 10) * 1000);
        await db.query(
          `INSERT INTO kap_notif SELECT *, $6 FROM unnest($1::int[], $2::text[], $3::timestamptz[], $4::text[], $5::text[]) ON CONFLICT (disclosure_index) DO UPDATE SET url = EXCLUDED.url`,
          [matched.map((_, i) => base - i), matched.map((r) => r.code), matched.map(() => published), matched.map(() => "Fon Tasfiye Duyurusu"), matched.map((r) => r.name), b.url],
        );
        console.log(`bülten ${b.no}: ${matched.length} fon tasfiye olarak işlendi (${matched.map((r) => r.code).join(", ")})`);
      } else {
        console.log(`bülten ${b.no}: "tasfiye ettirilmesine" geçiyor ama bilinen fon adıyla eşleşme yok, elle kontrol edin: ${b.url}`);
      }
    }
    await db.query("INSERT INTO spk_bulten_scanned VALUES ($1) ON CONFLICT DO NOTHING", [b.no]);
  }
  await db.end();
}
await main();
