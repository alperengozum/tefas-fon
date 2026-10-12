// Stopaj kaynakları: Ziraat PDF tablosu, banka duyuru metinleri, kaynak/tablo tutarlılığı ve karar (gerçek sayfalar fixture)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSource, decide, findZiraatPdf, htmlText, parseProse, parseZiraatTable, pdfLines } from "../scripts/stopaj-sources.mjs";
import { mergeRules, ruleAt, STOPAJ_RULES } from "../src/lib/stopaj-rules.mjs";
import { stopajRate } from "../src/lib/portfolio.ts";

const fx = (f) => readFileSync(new URL(`fixtures/${f}`, import.meta.url));
const ziraat = async () => parseZiraatTable(await pdfLines(fx("stopaj-ziraat-20260327.pdf")));
const garanti = () => parseProse(fx("stopaj-garanti.txt").toString());
const yapikredi = () => parseProse(fx("stopaj-yapikredi.txt").toString());

test("Ziraat PDF tablosu: 7 dönem, a/b grupları ve serbest hisse yoğun sütunu = koddaki tablo", async () => {
  const rows = await ziraat();
  assert.deepEqual(rows, STOPAJ_RULES.map((r) => (r.from === "2026-03-27" ? { from: r.from, serbestHisseYogun: 0.175 } : { from: r.from, a: r.a, b: r.b })));
});

test("Ziraat ana sayfasında stopaj PDF bağlantısı bulunur (dosya adı değişken)", () => {
  const html = `<a href="/x/rapor.pdf">rapor</a><a href="https://www.ziraatportfoy.com.tr/Documents/Banner//ZFG_PORTFOY_yat%C4%B1r%C4%B1m-fonlar%C4%B1-stopaj-oranlar%C4%B1-hakk%C4%B1nda-01-02-2027-pdf_401.pdf">x</a>`;
  assert.match(findZiraatPdf(html, "https://www.ziraatportfoy.com.tr/"), /stopaj-oranlar%C4%B1-hakk%C4%B1nda-01-02-2027-pdf_401\.pdf$/);
  assert.equal(findZiraatPdf(`<a href="/a.pdf">a</a>`, "https://x.com/"), null);
});

test("Garanti BBVA duyurusu: dönemler, '%15’den %17.5’e' yeni oran, 'hariç' -> b grubu, 'tarihine kadar' atlanır", () => {
  assert.deepEqual(garanti(), [
    { from: "2025-07-09", a: 0.175, b: 0.175 }, { from: "2025-02-01", a: 0.15, b: 0.15 }, { from: "2024-11-01", a: 0.1, b: 0.1 },
    { from: "2024-05-01", b: 0.075 }, { from: "2020-12-23", b: 0 },
  ]);
});

test("Yapı Kredi duyurusu: ';' ve 'aşağıdaki stopaj oranları' ile taşınan grup; tahvil/bono cümleleri karışmaz", () => {
  assert.deepEqual(yapikredi(), [{ from: "2025-02-01", a: 0.15, b: 0.15 }, { from: "2024-11-01", a: 0.1, b: 0.1 }, { from: "2020-12-23", b: 0 }, { from: "2024-05-01", b: 0.075 }]);
});

test("htmlText: etiket, script ve Türkçe HTML varlıkları", () => {
  assert.equal(htmlText(`<p>i&ccedil;in &ldquo;d&ouml;viz&rdquo;<script>x()</script> 01.11.2024 &ndash; 31.01.2025 G&uuml;n</p>`), ` için "döviz" 01.11.2024 – 31.01.2025 Gün `);
});

test("decide: üç gerçek kaynak da tabloyla tutarlı, yeni dönem yok -> hiçbir şey uygulanmaz", async () => {
  const d = decide([{ name: "Ziraat", rows: await ziraat() }, { name: "Garanti", rows: garanti() }, { name: "Yapı Kredi", rows: yapikredi() }], STOPAJ_RULES);
  assert.deepEqual(d.apply, []);
  assert.deepEqual(d.log, ["Ziraat: tutarlı, yeni dönem yok", "Garanti: tutarlı, yeni dönem yok", "Yapı Kredi: tutarlı, yeni dönem yok"]);
});

test("decide: Ziraat yeni dönem gösterir, bayat bankalar tutarlı -> yeni dönem uygulanır; eksik alan öncekinden devralınır", async () => {
  const z = [...(await ziraat()), { from: "2027-01-01", a: 0.2, b: 0.15 }];
  const d = decide([{ name: "Ziraat", rows: z }, { name: "Garanti", rows: garanti() }], STOPAJ_RULES);
  assert.deepEqual(d.apply, [{ from: "2027-01-01", a: 0.2, b: 0.15, serbestHisseYogun: 0.175 }]);
  assert.equal(d.source, "Ziraat");
  const only = checkSource([{ from: "2027-01-01", b: 0.2 }], STOPAJ_RULES); // metin yalnız b grubunu söylüyorsa a önceki dönemden
  assert.deepEqual(only.fresh, [{ from: "2027-01-01", a: 0.175, b: 0.2, serbestHisseYogun: 0.175 }]);
});

test("decide: birincil okunamaz/çelişirse diğer kaynak kullanılır; ayrışan kaynaklar ve geçersiz oran uygulanmaz", async () => {
  const fresh = { from: "2027-01-01", a: 0.2, b: 0.2 };
  // Ziraat hatalı (geçmişte b=%5 okumuş) -> kullanılmaz, Garanti'nin yeni dönemi uygulanır
  const bad = (await ziraat()).map((r) => (r.from === "2024-05-01" ? { ...r, b: 0.05 } : r));
  const d1 = decide([{ name: "Ziraat", rows: bad }, { name: "Garanti", rows: [...garanti(), fresh] }], STOPAJ_RULES);
  assert.deepEqual(d1.apply.map((r) => r.from), ["2027-01-01"]);
  assert.match(d1.log[0], /^Ziraat: tablo ile çelişiyor, kullanılmadı \(2024-05-01 b: kaynak 0.05, tablo 0.075\)/);
  // Ziraat erişilemez -> Garanti
  const d2 = decide([{ name: "Ziraat", error: "HTTP 503" }, { name: "Garanti", rows: [...garanti(), fresh] }], STOPAJ_RULES);
  assert.equal(d2.source, "Garanti");
  assert.equal(d2.log[0], "Ziraat: okunamadı (HTTP 503)");
  // iki tutarlı kaynak farklı yeni oran -> hiçbiri
  const d3 = decide([{ name: "A", rows: [fresh] }, { name: "B", rows: [{ ...fresh, a: 0.25 }] }], STOPAJ_RULES);
  assert.deepEqual(d3.apply, []);
  assert.match(d3.log.at(-1), /ayrışıyor/);
  // aynı yeni oranda anlaşan iki kaynak -> uygulanır, kaynak adları birlikte
  assert.equal(decide([{ name: "A", rows: [fresh] }, { name: "B", rows: [fresh] }], STOPAJ_RULES).source, "A + B");
  // yüzde/oran karışıklığı (17.5) ve satırsız kaynak reddedilir
  assert.deepEqual(decide([{ name: "A", rows: [{ from: "2027-01-01", a: 17.5, b: 17.5 }] }, { name: "B", rows: [] }], STOPAJ_RULES).apply, []);
});

test("mergeRules: otomatik dönem koddaki tabloya eklenir ve stopajRate onu kullanır", () => {
  const rules = mergeRules(STOPAJ_RULES, [{ from: "2027-01-01", a: 0.2, b: 0.2, serbestHisseYogun: 0.175 }]);
  assert.equal(rules.length, STOPAJ_RULES.length + 1);
  assert.equal(ruleAt("2027-02-01", rules).a, 0.2);
  const ppf = { kind: "YAT", name: "X PARA PİYASASI FONU", stockFocus: false, stock: 0 };
  assert.equal(stopajRate(ppf, "2027-02-01", "2027-06-01", rules), 0.2);
  assert.equal(stopajRate(ppf, "2027-02-01", "2027-06-01"), 0.175); // kural verilmezse koddaki tablo
  assert.equal(stopajRate(ppf, "2026-12-31", "2027-06-01", rules), 0.175);
  assert.equal(mergeRules(STOPAJ_RULES, [{ from: "2025-07-09", a: 0.18, b: 0.18 }]).find((r) => r.from === "2025-07-09").karar, "10041"); // aynı tarih: ek kazanır, alanlar birleşir
});
