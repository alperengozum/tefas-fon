// Hedef planlayıcı: tohumlu RNG, blok bootstrap, doğrusal değer, olasılık ve gereken aylık
import { test } from "node:test";
import assert from "node:assert/strict";
import { goalStats, quantile, rng, seedOf, simulatePaths } from "../src/lib/goal.ts";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test("rng: aynı tohum aynı dizi, [0,1) aralığında; seedOf kararlı", () => {
  const a = rng(42), b = rng(42), xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, b));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.equal(seedOf("AAA|1000"), seedOf("AAA|1000"));
  assert.notEqual(seedOf("AAA|1000"), seedOf("AAA|1001"));
});

test("sıfır getiri: A = 1, B = katkı sayısı; enflasyonla bugünün parası korunur", () => {
  const p = simulatePaths(new Array(60).fill(0), 2, 10, 1);
  assert.deepEqual(p.A[1], new Array(10).fill(1));
  assert.deepEqual(p.B[0], new Array(10).fill(12));
  assert.deepEqual(p.B[1], new Array(10).fill(24));
  const inf = simulatePaths(new Array(60).fill(0), 1, 3, 1, 0.5); // katkı enflasyonla artar, değer indirgenir
  near(inf.A[0][0], 1 / 1.5); // getirisiz başlangıç parası yılda %50 enflasyonla eriyor
  const im = 1.5 ** (1 / 12); // ay k'daki katkı bugünün parasıyla 1, yıl sonuna kadar im^(12-k) erir
  near(inf.B[0][0], Array.from({ length: 12 }, (_, j) => im ** -(j + 1)).reduce((s, x) => s + x, 0));
});

test("sabit günlük getiri: tüm senaryolar aynı ve tam bileşik", () => {
  const r = 0.001, p = simulatePaths(new Array(100).fill(r), 1, 5, 7);
  const g = (1 + r) ** 21;
  near(p.A[0][0], g ** 12);
  near(p.B[0][0], Array.from({ length: 12 }, (_, k) => g ** (12 - k)).reduce((s, x) => s + x, 0));
  assert.ok(p.A[0].every((x) => Math.abs(x - p.A[0][0]) < 1e-9));
  assert.throws(() => simulatePaths([0.01], 1, 1, 1), /yetersiz/);
});

test("goalStats: yüzdelikler sıralı; gereken aylık hedefi medyanda tutturur; olasılık aylık arttıkça artar", () => {
  const daily = Array.from({ length: 250 }, (_, i) => 0.002 + 0.02 * Math.sin(i * 1.7));
  const p = simulatePaths(daily, 5, 2000, seedOf("test"));
  const s = goalStats(p, 10000, 1000, 120000);
  for (const y of s.yearly) assert.ok(y.p10 <= y.p50 && y.p50 <= y.p90);
  assert.equal(s.yearly.length, 5);
  assert.ok(s.need50 < s.need80); // daha yüksek olasılık daha çok aylık ister
  const at50 = goalStats(p, 10000, s.need50, 120000);
  near(at50.prob, 0.5, 0.01);
  near(at50.yearly[4].p50, 120000, 1e-3);
  near(goalStats(p, 10000, s.need80, 120000).prob, 0.8, 0.01); // %80 için gereken aylıkla olasılık %80
  assert.ok(goalStats(p, 10000, s.need50 * 0.5, 120000).prob < 0.5);
  const none = goalStats(p, 10000, 1000, null);
  assert.equal(none.prob, null);
  assert.equal(goalStats(p, 1e9, 0, 1).need50, 0); // başlangıç zaten yeter
});

test("quantile: doğrusal ara değer", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([5], 0.9), 5);
});
