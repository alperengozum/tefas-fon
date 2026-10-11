// BYF prim/iskonto: borsa bülten fiyatı / NAV
import { test } from "node:test";
import assert from "node:assert/strict";
import { premiums, premiumStats } from "../src/lib/premium.ts";

const day = (n) => new Date(Date.UTC(2026, 9, 10) - n * 864e5).toISOString().slice(0, 10);
// 400 gün: NAV 100, borsa fiyatı +%1 (son 30 gün) / -%1 (öncesi); bir gün bülten yok, bir gün NAV 0
const H = Array.from({ length: 400 }, (_, i) => {
  const n = 399 - i;
  return { date: day(n), price: n === 50 ? 0 : 100, bprice: n === 40 ? null : n < 30 ? 101 : 99 };
});

test("premiums: eksik bülten ve NAV 0 atlanır, since filtresi", () => {
  const p = premiums(H);
  assert.equal(p.length, 398);
  assert.ok(Math.abs(p[p.length - 1].prem - 1) < 1e-9);
  assert.equal(premiums(H, day(9)).length, 10);
});

test("premiumStats: son değer, 30 gün / 1 yıl ortalaması, aralık", () => {
  const s = premiumStats(H);
  assert.equal(s.last.date, day(0));
  assert.equal(s.last.bprice, 101);
  assert.ok(Math.abs(s.last.prem - 1) < 1e-9);
  assert.ok(Math.abs(s.avg30 - 29 / 31) < 1e-9); // pencere 30 gün öncesini de içerir: 30 gün +%1, sınır günü -%1
  assert.ok(s.avg1y < 0); // 1 yılın çoğu iskontolu
  assert.ok(Math.abs(s.absAvg1y - 1) < 1e-9);
  assert.ok(Math.abs(s.min.prem + 1) < 1e-9);
  assert.ok(Math.abs(s.max.prem - 1) < 1e-9);
  assert.ok(s.n >= 360 && s.n <= 366);
});

test("premiumStats: bülten fiyatı yoksa ya da bayatsa null", () => {
  assert.equal(premiumStats([]), null);
  assert.equal(premiumStats(H.map((r) => ({ ...r, bprice: null }))), null);
  assert.equal(premiumStats(H.map((r, i) => (i > 380 ? { ...r, bprice: null } : r))), null); // son 19 gün bülten yok
});
