// stats.ts saf hesapları (node --experimental-strip-types ile doğrudan .ts okunur)
import { test } from "node:test";
import assert from "node:assert/strict";
import { beta, corr, dailyReturns, overlap, rolling, simulate, xirr } from "../src/lib/stats.ts";

const series = (n, f, start = "2025-01-01") => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10), price: f(i) }));

test("korelasyon ve beta: b = 2x getirili seri", () => {
  const bench = series(60, (i) => 100 * (1 + 0.01 * Math.sin(i)) ** i);
  const a = dailyReturns(bench, "2025-01-01");
  const twice = new Map([...a].map(([d, v]) => [d, 2 * v]));
  assert.ok(Math.abs(corr(twice, a) - 1) < 1e-9);
  assert.ok(Math.abs(beta(twice, a) - 2) < 1e-9);
  assert.equal(corr(new Map([["2025-01-02", 0.1]]), a), null); // az ortak gün
});

test("hisse örtüşmesi = Σ min ağırlık", () => {
  const a = [{ ticker: "A", weight: 10 }, { ticker: "B", weight: 5 }];
  const b = [{ ticker: "A", weight: 4 }, { ticker: "C", weight: 9 }];
  assert.equal(overlap(a, b), 4);
});

test("xirr: 1 yılda %10", () => {
  assert.ok(Math.abs(xirr([["2025-01-01", -100], ["2026-01-01", 110]]) - 0.1) < 1e-3);
});

test("SIP: sabit fiyatta getiri 0, %1/gün artışta pozitif; tek seferlik doğru", () => {
  const flat = simulate(series(200, () => 10), 1000, "2025-01-01", "2025-07-01");
  assert.equal(flat.n, 7); // 1 Oca ... 1 Tem
  assert.equal(flat.invested, 7000);
  assert.ok(Math.abs(flat.ret) < 1e-9 && Math.abs(flat.lump) < 1e-9);
  const up = simulate(series(200, (i) => 10 * 1.01 ** i), 1000, "2025-01-01", "2025-07-01");
  assert.ok(up.ret > 0 && up.xirr > 0);
  assert.ok(Math.abs(up.lump - (1.01 ** 181 - 1) * 100) < 1e-6);
  assert.equal(simulate(series(50, () => 10), 1000, "2030-01-01", "2030-06-01"), null); // veri dışı
});

test("SIP: 31'inde başlayan alım kısa aylarda taşmaz", () => {
  const r = simulate(series(120, () => 10), 100, "2025-01-31", "2025-04-30");
  assert.equal(r.n, 4); // 31 Oca, 28 Şub, 31 Mar, 30 Nis
});

test("kayan getiri: sabit seride hepsi 0", () => {
  const r = rolling(series(120, () => 10), 30);
  assert.equal(r.min, 0);
  assert.equal(r.pos, 0);
});
