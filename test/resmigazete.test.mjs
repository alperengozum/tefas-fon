// Resmi Gazete fihrist ayrıştırma (stopaj bekçisi): gerçek fihrist sayfaları (windows-1254) fixture olarak
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decode, fihristUrl, parseFihrist } from "../scripts/resmigazete.mjs";
import { KNOWN_KARARLAR } from "../src/lib/stopaj-rules.mjs";

const page = (f) => decode(readFileSync(new URL(`fixtures/${f}`, import.meta.url)));

test("fihristUrl: günlük ve mükerrer sayı adresi", () => {
  assert.equal(fihristUrl("2026-03-27"), "https://www.resmigazete.gov.tr/eskiler/2026/03/20260327.htm");
  assert.equal(fihristUrl("2026-03-27", 1), "https://www.resmigazete.gov.tr/eskiler/2026/03/20260327M1.htm");
});

test("parseFihrist: 27.03.2026 sayısında Karar 11107 ve PDF linki; başka karar yakalanmaz", () => {
  const url = fihristUrl("2026-03-27");
  const k = parseFihrist(page("rg-20260327.htm"), url);
  assert.equal(k.length, 1); // aynı gün 11108 (ücretsiz mal/hizmet) geçici 67 değil
  assert.equal(k[0].karar, "11107");
  assert.match(k[0].title, /^193 Sayılı Gelir Vergisi Kanununun Geçici 67 nci Maddesinde Yer Alan Tevkifat Oranları Hakkında Karar/);
  assert.equal(k[0].url, "https://www.resmigazete.gov.tr/eskiler/2026/03/20260327-5.pdf");
});

test("parseFihrist: 09.07.2025 sayısında Karar 10041; ikisi de tabloda bilinen karar", () => {
  const k = parseFihrist(page("rg-20250709.htm"), fihristUrl("2025-07-09"));
  assert.deepEqual(k.map((x) => x.karar), ["10041"]);
  assert.match(k[0].url, /^https:\/\/www\.resmigazete\.gov\.tr\/eskiler\/2025\/07\/20250709-\d+\.pdf$/);
  assert.ok(KNOWN_KARARLAR.has("10041") && KNOWN_KARARLAR.has("11107"));
});

test("parseFihrist: başka bir geçici madde veya kanun eşleşmez; bilinmeyen karar ayıklanır", () => {
  const html = `<a href="a.pdf">193 Sayılı Gelir Vergisi Kanununun Geçici 67 nci Maddesinde Yer Alan Tevkifat Oranları Hakkında Karar (Karar Sayısı: 12345)</a>
    <a href="b.pdf">Kurumlar Vergisi Kanununun Geçici 67 nci ... Karar (Karar Sayısı: 1)</a>
    <a href="c.pdf">193 Sayılı Gelir Vergisi Kanununun Geçici 76 ncı Maddesi ... Karar (Karar Sayısı: 2)</a>`;
  const k = parseFihrist(html, fihristUrl("2027-01-05"));
  assert.deepEqual(k.map((x) => [x.karar, x.url]), [["12345", "https://www.resmigazete.gov.tr/eskiler/2027/01/a.pdf"]]);
  assert.ok(!KNOWN_KARARLAR.has("12345"));
});
