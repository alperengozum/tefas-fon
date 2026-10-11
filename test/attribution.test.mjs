// Hisse sepeti vs fon getirisi (KAP ağırlıkları x hisse getirileri)
import { test } from "node:test";
import assert from "node:assert/strict";
import { at, attribution, shiftNext } from "../src/lib/attribution.ts";

const d = (n) => new Date(Date.UTC(2026, 8, 1) + n * 864e5).toISOString().slice(0, 10); // d(0) = 2026-09-01
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ date: d(i), price: f(i) }));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("shiftNext: kapanış bir sonraki günün tarihiyle etiketlenir, son kapanış atılır", () => {
  assert.deepEqual(shiftNext(series(3, (i) => 10 + i)), [{ date: d(1), price: 10 }, { date: d(2), price: 11 }]);
});

test("at: tarihte ya da öncesindeki son fiyat; 7 günden eskiyse ya da 0 ise null", () => {
  const h = [{ date: d(0), price: 5 }, { date: d(3), price: 6 }, { date: d(4), price: 0 }];
  assert.equal(at(h, d(3)), 6);
  assert.equal(at(h, d(2)), 5);
  assert.equal(at(h, d(4)), null);
  assert.equal(at(h, d(20)), null);
  assert.equal(at(h, d(-1)), null);
});

// Dönem sonu d(9): fon fiyatı d(10)'dan itibaren o günün kapanışını yansıtır. Fon %10, A %20, B -%10 kazanır (d10 -> d30).
const fund = series(31, (i) => (i < 10 ? 100 : 100 + (i - 10) * 0.5));
const stocks = {
  A: series(31, (i) => (i < 10 ? 50 : 50 * (1 + 0.01 * (i - 10)))),
  B: series(31, (i) => (i < 10 ? 20 : 20 * (1 - 0.005 * (i - 10)))),
};
const bench = series(31, (i) => (i < 10 ? 1000 : 1000 + (i - 10) * 2.5));

test("attribution: sepet getirisi, fona katkı, fark, endeks ve sıralı satırlar", () => {
  const a = attribution({ weights: [{ ticker: "A", weight: 30 }, { ticker: "B", weight: 10 }], period: d(9), until: d(30), fund, stocks, bench });
  assert.equal(a.start, d(10));
  assert.equal(a.end, d(30));
  assert.equal(a.days, 20);
  near(a.fund, 10);
  near(a.contrib, 0.3 * 20 + 0.1 * -10); // 5 puan
  near(a.basket, (0.3 * 20 + 0.1 * -10) / 0.4); // %12,5
  near(a.rest, 5);
  near(a.bench, 5);
  assert.equal(a.stockWeight, 40);
  assert.equal(a.covered, 40);
  assert.deepEqual(a.rows.map((r) => r.ticker), ["A", "B"]); // |katkı| büyükten küçüğe
  near(a.rows[1].ret, -10);
});

test("attribution: kapanmış dönem (until), eksik fiyatlı hisse kapsam dışı", () => {
  const a = attribution({ weights: [{ ticker: "A", weight: 30 }, { ticker: "YOK", weight: 10 }], period: d(9), until: d(20), fund, stocks });
  assert.equal(a.end, d(20));
  near(a.fund, 5);
  near(a.basket, 10);
  assert.equal(a.covered, 30);
  assert.equal(a.stockWeight, 40);
  assert.equal(a.bench, null);
});

test("attribution: dönem 5 günden kısa, kapsam yarıdan az ya da fon verisi yoksa null", () => {
  const w = [{ ticker: "A", weight: 30 }];
  assert.equal(attribution({ weights: w, period: d(26), until: d(30), fund, stocks }), null);
  assert.equal(attribution({ weights: [{ ticker: "A", weight: 10 }, { ticker: "YOK", weight: 20 }], period: d(9), until: d(30), fund, stocks }), null);
  assert.equal(attribution({ weights: w, period: d(40), until: d(50), fund, stocks }), null);
  assert.equal(attribution({ weights: [], period: d(9), until: d(30), fund, stocks }), null);
});
