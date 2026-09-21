// KAP PDR ayrıştırıcısı: farklı şirket düzenlerinden gerçek PDF'ler (TEFAS hisse % değeri `hs`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePdr } from "../scripts/holdings.mjs";

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
