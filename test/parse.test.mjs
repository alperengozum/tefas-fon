// KAP PDR ayrıştırıcısı: farklı şirket düzenlerinden gerçek PDF'ler (TEFAS hisse % değeri `hs`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePdr, periodEnd } from "../scripts/holdings.mjs";

const CASES = [ // kod, TEFAS hs, hisse sayısı, en büyük hisse
  ["IJA", 62.4, 19, "TUPRS"], ["ZJB", 120.9, 23, "ZRGYO"], ["KH1", 87.1, 25, "TUPRS"], ["KTS", 81.4, 16, "BIMAS"],
  ["TLH", 87.7, 20, "AYDEM"], ["DKC", 60, 2, "THYAO"], ["GBJ", 88.7, 6, "AKBNK"],
];
for (const [code, hs, n, top] of CASES)
  test(`${code} hisse portföyü`, async () => {
    const r = await parsePdr(readFileSync(new URL(`./fixtures/${code}.pdf`, import.meta.url)), hs);
    assert.ok(r, "okunamadı");
    assert.equal(r.length, n);
    assert.equal(r[0].ticker, top);
  });

test("rapor dönemi sonu (ay sonu, ISO hafta pazarı)", () => {
  assert.equal(periodEnd("8. Ay 2026"), "2026-08-31");
  assert.equal(periodEnd("2. Ay 2024"), "2024-02-29");
  assert.equal(periodEnd("36. Hafta 2026"), "2026-09-06");
  assert.equal(periodEnd("1. Hafta 2021"), "2021-01-10");
  assert.equal(periodEnd("53. Hafta 2020"), "2021-01-03");
  assert.equal(periodEnd(null), null);
});
