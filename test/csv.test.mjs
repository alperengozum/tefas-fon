// CSV: Türkçe Excel biçimi
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/lib/csv.ts";

test("BOM, ; ayırıcı, CRLF, ondalık virgül", () => {
  assert.equal(toCsv(["Kod", "Getiri %"], [["AAA", 12.5], ["BBB", -3]]), "﻿Kod;Getiri %\r\nAAA;12,5\r\nBBB;-3\r\n");
});

test("boş/sonsuz değer boş hücre; uzun ondalık 6 haneye yuvarlanır", () => {
  assert.equal(toCsv(["a", "b", "c", "d"], [[null, undefined, NaN, 1 / 3]]), "﻿a;b;c;d\r\n;;;0,333333\r\n");
});

test("; tırnak ve satır sonu içeren metin tırnaklanır, içteki tırnak ikilenir", () => {
  assert.equal(toCsv(["Fon"], [["A; B"], ['X "DÖVİZ" FON'], ["iki\nsatır"]]), '﻿Fon\r\n"A; B"\r\n"X ""DÖVİZ"" FON"\r\n"iki\nsatır"\r\n');
});
