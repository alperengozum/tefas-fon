// USD bazında getiri: çevirme formülü ve liste verisinde usd meta alanı
import { test } from "node:test";
import assert from "node:assert/strict";
import { inBase, PERIOD_DAYS } from "../src/lib/analytics.ts";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

test("inBase: TL %50, USD/TRY %25 -> USD bazında %20; TL %10, dolar %20 -> zarar", () => {
  near(inBase(50, 25), 20);
  near(inBase(10, 20), (1.1 / 1.2 - 1) * 100);
  assert.ok(inBase(10, 20) < 0);
  near(inBase(0, 0), 0);
});

test("inBase: eksik veya sonsuz değer null", () => {
  assert.equal(inBase(null, 10), null);
  assert.equal(inBase(10, undefined), null);
  assert.equal(inBase(Infinity, 10), null);
});

test("PERIOD_DAYS: liste getiri anahtarlarının hepsi (db.ts PERIODS + ytd)", () => {
  assert.deepEqual(PERIOD_DAYS.map(([k]) => k).sort(), ["d1", "m1", "m3", "m6", "w1", "y1", "y2", "y3", "y5", "ytd"]);
});
