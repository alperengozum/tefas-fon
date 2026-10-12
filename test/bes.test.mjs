// BES simülasyonu: devlet katkısı oranı/tavanı, hak ediş, DK fonu
import { test } from "node:test";
import assert from "node:assert/strict";
import { dkRule, MIN_WAGE_YEAR, simulateBes, vesting } from "../src/lib/bes.ts";
import { xirr } from "../src/lib/stats.ts";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const series = (n, f, start) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10), price: f(i) }));

test("DK oranı: 2025 sonu %30, 2026 başı %20; tavan oranı aynı", () => {
  assert.equal(dkRule("2025-12-31").rate, 0.3);
  assert.equal(dkRule("2026-01-01").rate, 0.2);
  assert.equal(dkRule("2021-06-01").rate, 0.25);
  near(MIN_WAGE_YEAR[2025] * dkRule("2025-06-01").cap, 93619.8); // resmi 2025 tavanı
  near(MIN_WAGE_YEAR[2026] * dkRule("2026-06-01").cap, 79272); // resmi 2026 tavanı
});

test("hak ediş eşikleri ve 56 yaş", () => {
  assert.deepEqual([0, 2.99, 3, 5.99, 6, 9.99, 10].map((y) => vesting(y)), [0, 0, 0.15, 0.15, 0.35, 0.35, 0.6]);
  assert.equal(vesting(10, 56), 1);
  assert.equal(vesting(10, 55.9), 0.6);
  assert.equal(vesting(9.9, 60), 0.35); // 10 yıl şartı
});

test("sabit fiyat: katkı değeri = yatırılan; DK %30 (2025) ve %20 (2026), hak ediş 0 (3 yıldan kısa)", () => {
  const h = series(400, () => 10, "2025-07-01"); // 2025-07-01 .. 2026-08-04
  const r = simulateBes(h, h, 1000, "2025-07-01", "2026-07-31", 30, xirr);
  assert.equal(r.n, 13); // Tem 2025 .. Tem 2026
  assert.equal(r.invested, 13000);
  near(r.value, 13000);
  near(r.dkPaid, 6 * 300 + 7 * 200); // 2025'te 6 ay %30, 2026'da 7 ay %20
  near(r.dkValue, r.dkPaid);
  assert.equal(r.vest, 0);
  near(r.total, 13000);
  assert.deepEqual(r.byYear.map((y) => [y.year, y.paid, y.dk]), [[2025, 6000, 1800], [2026, 7000, 1400]]);
  assert.deepEqual(r.capUnknown, []);
  assert.equal(r.dkCash, false);
});

test("yıllık tavan: büyük katkıda DK yıl içinde tavanda durur", () => {
  const h = series(200, () => 10, "2026-01-01");
  const r = simulateBes(h, h, 100000, "2026-01-01", "2026-06-30", null, xirr); // ayda 20.000 DK -> 79.272'de durur
  near(r.dkPaid, 79272);
  assert.equal(r.byYear[0].dk, 79272);
});

test("DK ayrı fonda değerlenir; DK fonunda fiyat yoksa nakit kalır; tavanı bilinmeyen yıl işaretlenir", () => {
  const f = series(200, () => 10, "2025-01-01"), dk = series(200, (i) => 10 * (1 + i / 100), "2025-01-01");
  const r = simulateBes(f, dk, 1000, "2025-01-01", "2025-06-30", null, xirr);
  assert.ok(r.dkValue > r.dkPaid); // DK fonu yükseldi
  const cash = simulateBes(f, [], 1000, "2025-01-01", "2025-06-30", null, xirr);
  assert.equal(cash.dkCash, true);
  near(cash.dkValue, cash.dkPaid);
  const old = simulateBes(series(120, () => 10, "2021-01-01"), [], 1000, "2021-01-01", "2021-03-31", null, xirr);
  assert.deepEqual(old.capUnknown, [2021]);
  assert.equal(simulateBes(f, f, 1000, "2030-01-01", "2030-06-01", null, xirr), null);
});

test("hak ediş toplamı: 10 yıl + 56 yaş -> DK'nın tamamı çekilebilir", () => {
  const h = series(3700, () => 10, "2016-01-01"); // ~10.1 yıl
  const r = simulateBes(h, h, 100, "2016-01-01", "2026-02-15", 50, xirr);
  assert.ok(r.years >= 10);
  assert.equal(r.vest, 1);
  near(r.total, r.value + r.dkValue);
  assert.ok(r.ret > 0 && r.xirr > 0); // DK sayesinde sabit fiyatta bile getiri
});
