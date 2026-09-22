// KAP "Portföy Dağılım Raporu" PDF'lerinden fonların hisse portföyünü çıkarır: node scripts/holdings.mjs [gün]
// Akış: funds/byCriteria (günlük pencere) -> fon başına son PDR -> attachment-detail -> PDF -> HİSSE SENETLERİ tablosu.
import pg from "pg";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const KAP = "https://www.kap.org.tr/tr/";
const HDR = { "Content-Type": "application/json", Referer: KAP, "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36" };
const norm = (s) => s.toUpperCase().replace(/İ/g, "I").replace(/[ÖÜŞÇĞ]/g, (c) => ({ Ö: "O", Ü: "U", Ş: "S", Ç: "C", Ğ: "G" })[c]).replace(/[^A-Z0-9]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10);
// KAP publishDate "GG.AA.YYYY SS:dd:ss" formatında, saat dilimi belirtilmez: Türkiye sabit +03.
const kapTs = (s) => { const [d, t] = s.split(" "); return `${d.split(".").reverse().join("-")}T${t || "00:00:00"}+03:00`; };
const num = (s) => Number(s.replace(/\./g, "").replace(",", "."));

// KAP hız sınırı uyguluyor (429). Tüm istekler tek kapıdan geçer: en az `gap` ms aralık, 429'da aralık büyür ve uzun bekler.
const MIN_GAP = 3000; // ~20 istek/dk: daha hızlısında KAP bağlantıları kesiyor
let gap = MIN_GAP, lastReq = 0, gate = Promise.resolve();
const wait = () => (gate = gate.then(async () => { await sleep(Math.max(0, lastReq + gap - Date.now())); lastReq = Date.now(); }));
async function kap(path, opts, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await wait();
    try {
      const r = await fetch(KAP + path, { headers: HDR, signal: AbortSignal.timeout(60000), ...opts });
      if (r.ok) { gap = Math.max(MIN_GAP, gap * 0.95); return r; }
      if (!r.ok && r.status !== 429) console.log("  HTTP", r.status, path);
      if (r.status === 429) { gap = Math.min(gap * 1.5, 8000); console.log(`  429, aralık ${Math.round(gap)}ms`); await sleep(Number(r.headers.get("retry-after")) * 1000 || 30000 * (i + 1)); continue; }
    } catch (e) { gap = Math.min(gap * 1.3, 8000); console.log("  ağ hatası:", e.cause?.code ?? e.message, `aralık ${Math.round(gap)}ms`); }
    await sleep(20000 * (i + 1)); // KAP engeli dakikalar sürebiliyor
  }
  throw new Error("KAP isteği başarısız: " + path);
}

// PDF -> satırlar (aynı y'deki hücreler soldan sağa)
export async function pdfLines(buf) {
  const i = buf.indexOf("%PDF"); // KAP dosyaları başında Java serileştirme başlığı taşıyor
  const doc = await getDocument({ data: new Uint8Array(buf.subarray(i)), useSystemFonts: true, verbosity: 0 }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const rows = new Map();
    for (const t of (await (await doc.getPage(p)).getTextContent()).items) {
      const s = t.str.trim();
      if (s) { const y = Math.round(t.transform[5]); (rows.get(y) ?? rows.set(y, []).get(y)).push([t.transform[4], s]); }
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) lines.push(rows.get(y).sort((a, b) => a[0] - b[0]).map((c) => c[1]));
  }
  return lines;
}

// Sayı: "1.234,56", "1,234.56", "%79,99", "3,466775" -> Number
const NUM = /^-?%?[\d.,]+%?$/;
function toNum(s) {
  s = s.replace(/%/g, "");
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc >= 0) s = (s.match(/,/g).length === 1 && s.length - lc - 1 !== 3) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (ld >= 0) s = (s.match(/\./g).length === 1 && s.length - ld - 1 !== 3) ? s : s.replace(/\./g, "");
  return Number(s);
}
// Başlık iki satıra bölünebiliyor ("A) HİSSE" / "SENETLERİ"): önceki satırla birleştirip bak.
const START = /^(?:[A-ZÇ]\s*[.)-]\s*)?(?:H[İI]SSE SENETLER[İI]|PAY)\s*:?\s*$/i;
const END = /^(?:GRUP TOPLAMI|[B-ZÇ]\s*\)\s*\S|[B-ZÇ]\s*[.)-]\s*(?:DEVLET|HAZ[İI]NE|ÖZEL|K[İI]RA|BORÇ|MEVDUAT|TERS REPO|REPO|YATIRIM FON|BORSA|TÜREV|V[İI]OP|KATILIM|DÖV[İI]Z|YABANCI|ALTIN|DE[ĞG]ERL[İI]))|SATIŞ/i;
const FOREIGN_ISIN = /^(?!TR)[A-Z]{2}[A-Z0-9]{9}\d$/;

// PDR'nin hisse tablosu satırları + bölümün "GRUP TOPLAMI" satırı (varsa; kendi içinde tutarlılık kontrolü için).
export function parseRows(lines) {
  const rows = [];
  let inStock = false, grp = null, prev = "";
  for (const cells of lines) {
    const line = cells.join(" ").trim();
    const nums = cells.slice(1).filter((x) => NUM.test(x) && /\d/.test(x));
    const head = START.test(cells[0]) || (!nums.length && (START.test(line) || (line.length < 12 && START.test(prev + " " + line))));
    prev = nums.length ? "" : line;
    if (head) { inStock = true; continue; }
    if (!inStock) continue;
    if (/^GRUP TOPLAMI/i.test(line)) { grp = cells.filter((x) => NUM.test(x) && /\d/.test(x)).map(toNum); inStock = false; continue; }
    if (!nums.length && END.test(line)) { inStock = false; continue; }
    if (cells.some((x) => FOREIGN_ISIN.test(x))) continue; // yabancı hisse: TEFAS "hisse %"ine dahil değil
    const t = cells[0].replace(/^\d+\s+/, "").replace(/\.[A-Z]$/, "");
    if (!/^[A-Z][A-Z0-9]{2,5}$/.test(t) || /^(TOPLAM|GRUP|REPO|TPP|BPP)$/.test(t) || nums.length < 2) continue;
    rows.push({ t, v: nums.map(toNum) });
  }
  return { rows, grp };
}

// Ağırlık sütununu seç. 1) PDF'in kendi grup toplamıyla tutan sütun (sağdan: FTD, sonra FPD);
// 2) yoksa yüzde gibi görünen sütunlardan toplamı TEFAS'ın hisse %'sine en yakın olan (rapor eski olabildiği için geniş tolerans).
export function pickColumn({ rows, grp }, expected) {
  if (!rows.length) return null;
  const R = (r, j) => r.v[r.v.length - 1 - j];
  if (grp)
    for (let j = 0; j < Math.min(grp.length, 3); j++) {
      const g = grp[grp.length - 1 - j];
      if (rows.some((r) => R(r, j) === undefined)) continue;
      const sum = rows.reduce((s, r) => s + R(r, j), 0);
      if (g > 0 && g <= 250 && Math.abs(sum - g) <= Math.max(0.3, g * 0.03)) return { how: "grup", at: (r) => R(r, j) };
    }
  let best = null;
  for (const side of ["L", "R"])
    for (let j = 0; j < 9; j++) {
      const at = (r) => (side === "L" ? r.v[j] : R(r, j));
      if (rows.some((r) => at(r) === undefined || !isFinite(at(r)) || Math.abs(at(r)) > 200)) continue;
      const sum = rows.reduce((s, r) => s + at(r), 0), err = Math.abs(sum - expected);
      if (sum <= 250 && (!best || err < best.err)) best = { how: "tefas", err, at };
    }
  return best && best.err <= Math.max(6, expected * 0.3) ? best : null;
}

export async function parsePdr(buf, expected) {
  const parsed = parseRows(await pdfLines(buf));
  const best = pickColumn(parsed, expected);
  if (!best) return null;
  const out = new Map();
  for (const r of parsed.rows) out.set(r.t, (out.get(r.t) ?? 0) + best.at(r));
  return [...out].map(([ticker, weight]) => ({ ticker, weight })).filter((h) => h.weight > 0.005).sort((a, b) => b.weight - a.weight);
}

async function discover(db, days) {
  for (let i = 0; i < days; i++) {
    const d = ymd(new Date(Date.now() - i * 864e5));
    // son 2 gün her seferinde yeniden taranır (gün içinde yeni bildirim gelir)
    if (i >= 2 && (await db.query("SELECT 1 FROM kap_scanned WHERE day=$1", [d])).rowCount) continue;
    const list = await (await kap("api/disclosure/funds/byCriteria", { method: "POST", body: JSON.stringify({ fromDate: d, toDate: d, fundTypes: [], mkkMemberOid: null, disclosureClass: "", subjectList: [], index: "" }) })).json();
    const p = list.filter((x) => x.subject === "Portföy Dağılım Raporu" && x.fundCode);
    if (p.length)
      await db.query(
        `INSERT INTO kap_pdr SELECT * FROM unnest($1::int[], $2::text[], $3::date[], $4::text[], $5::text[]) ON CONFLICT DO NOTHING`,
        [p.map((x) => x.disclosureIndex), p.map((x) => x.fundCode), p.map((x) => x.publishDate.slice(0, 10).split(".").reverse().join("-")),
         p.map((x) => `${x.ruleType} ${x.year ?? ""}`.trim()), p.map((x) => x.kapTitle)]);
    // tasfiye duyurusu: fon TEFAS'a fiyat göndermeyi kesmeden günler/haftalar önce yayımlanabiliyor, data yaşına dayalı "pasif" tespiti bunu kaçırıyor
    const t = list.filter((x) => x.subject === "Fon Tasfiye Duyurusu" && x.fundCode);
    if (t.length)
      await db.query(
        `INSERT INTO kap_notif SELECT * FROM unnest($1::int[], $2::text[], $3::timestamptz[], $4::text[], $5::text[]) ON CONFLICT DO NOTHING`,
        [t.map((x) => x.disclosureIndex), t.map((x) => x.fundCode), t.map((x) => kapTs(x.publishDate)), t.map((x) => x.subject), t.map((x) => x.kapTitle)]);
    await db.query("INSERT INTO kap_scanned VALUES ($1) ON CONFLICT DO NOTHING", [d]);
  }
  return (await db.query("SELECT DISTINCT ON (code) code, disclosure_index, published::text AS published, rule, title FROM kap_pdr ORDER BY code, disclosure_index DESC")).rows;
}

// KAP ekindeki PDF; ek yoksa gövdeye bak: nitelikli yatırımcı fonları rapordan muaf tutulur (veri hiç yok).
async function fetchPdf(index) {
  const [d] = await (await kap(`api/notification/attachment-detail/${index}`)).json();
  const att = d?.attachments?.find((a) => /pdf/i.test(a.fileExtension ?? a.fileName ?? "")) ?? d?.attachments?.[0];
  if (!att) return { buf: null, note: /muaf/i.test((d?.disclosureBody ?? []).join(" ")) ? "muaf" : "okunamadi" };
  return { buf: Buffer.from(await (await kap(`api/file/download/${att.objId}`)).arrayBuffer()), note: null };
}

const PARSER_V = 3; // ayrıştırıcı iyileşince artır: eski sürümle işlenen fonlar yeniden okunur

async function main() {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://tefas:tefas@localhost/tefas" });
  await db.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  // aylık raporlayan fonlar için 75 gün geriye bak (günlük pencere başına 1 istek)
  const days = Number(process.argv[2] ?? 75);
  // sadece hisse tutan fonlar (TEFAS dağılımında hisse > 0)
  const { rows: eq } = await db.query("SELECT code, (data->>'hs')::float8 AS hs FROM alloc WHERE COALESCE((data->>'hs')::float8, 0) > 0");
  const want = new Map(eq.map((r) => [r.code, r.hs]));
  const have = new Map((await db.query("SELECT code, disclosure_index, v FROM holdings_meta")).rows.map((r) => [r.code, r]));
  // KAP kodu TEFAS kodundan farklı olabilir (BYF'lerde borsa kodu); önce kod, sonra tam ad eşleşmesi
  const names = new Map((await db.query("SELECT DISTINCT ON (code) code, name FROM info ORDER BY code, date DESC")).rows.map((r) => [norm(r.name), r.code]));
  const todo = (await discover(db, days))
    .map((x) => ({ ...x, tefas: want.has(x.code) ? x.code : names.get(norm(x.title)) }))
    .filter((x) => x.tefas && want.has(x.tefas) && (!have.has(x.tefas) || x.disclosure_index > have.get(x.tefas).disclosure_index || have.get(x.tefas).v < PARSER_V));
  console.log(`taranan ${days} gün, işlenecek ${todo.length} fon`);
  let done = 0, failed = 0, skipped = 0;
  // ponytail: 2 worker (indirme+PDF ayrıştırma örtüşsün), hız kapıdan sınırlı
  await Promise.all(Array.from({ length: 2 }, async () => {
    for (let x; (x = todo.pop()); ) {
      try {
        // İş Portföy PDF'lerinde yazı vektör çizgi olarak çizilmiş (metin yok, OCR güvenilmez): indirmeden atla
        let buf = null, note = "okunamadi";
        if (!x.title.startsWith("İŞ PORTFÖY")) ({ buf, note } = await fetchPdf(x.disclosure_index));
        const hs = buf ? await parsePdr(buf, want.get(x.tefas)) : null;
        // hs null: PDF okunamadı / düzen tanınmadı -> holdings boş, rapor işaretlenir (her gün yeniden indirilmesin)
        const c = await db.connect();
        try {
          await c.query("BEGIN");
          await c.query("DELETE FROM holdings WHERE code=$1", [x.tefas]);
          if (hs?.length)
            await c.query("INSERT INTO holdings SELECT $1, * FROM unnest($2::text[], $3::float8[])", [x.tefas, hs.map((h) => h.ticker), hs.map((h) => h.weight)]);
          await c.query(
            "INSERT INTO holdings_meta (code, disclosure_index, report, published, note, v) VALUES ($1,$2,$3,$4::date,$5,$6) ON CONFLICT (code) DO UPDATE SET disclosure_index=$2, report=$3, published=$4::date, note=$5, v=$6",
            [x.tefas, x.disclosure_index, hs ? x.rule : null, x.published, hs ? null : note ?? "okunamadi", PARSER_V]);
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
        if (!hs) skipped++;
        done++;
      } catch (e) { failed++; console.log("  hata", x.code, e.message); }
      if ((done + failed) % 50 === 0) console.log(`  ${done + failed} fon işlendi`);
    }
  }));
  console.log(`bitti: ${done - skipped} fon okundu, ${skipped} atlandı (düzen tanınmadı), ${failed} hata`);
  await db.end();
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
