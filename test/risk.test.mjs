// Risk metrikleri: en büyük düşüş, Sharpe/Sortino, kategori sırası, takvim getirileri
import { test } from "node:test";
import assert from "node:assert/strict";
import { annualVol, calendar, dailyReturns, drawdown, median, rank, ratios } from "../src/lib/stats.ts";

const series = (n, f, start = "2025-01-01") => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10), price: f(i) }));
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

test("drawdown: zirve 120 -> dip 90 = -25%, 121'de toparlanır", () => {
  const p = [100, 120, 110, 90, 100, 119, 121, 130];
  const d = drawdown(series(p.length, (i) => p[i]));
  near(d.max, -25);
  assert.equal(d.peak, "2025-01-02");
  assert.equal(d.trough, "2025-01-04");
  assert.equal(d.recovered, "2025-01-07"); // ilk >= 120
  assert.equal(d.recovery, 3);
});

test("drawdown: toparlanmamış düşüş, sürekli artış, fiyat 0 günleri, since", () => {
  const down = drawdown(series(5, (i) => 100 - i * 10));
  near(down.max, -40);
  assert.equal(down.recovered, null);
  assert.equal(down.recovery, null);
  assert.equal(drawdown(series(10, (i) => 100 + i)).max, 0);
  near(drawdown(series(6, (i) => [100, 0, 90, 0, 95, 100][i])).max, -10); // 0 = açıklanmadı, -100% değil
  assert.equal(drawdown(series(1, () => 1)), null);
  near(drawdown(series(8, (i) => [200, 100, 110, 120, 125, 130, 120, 125][i]), "2025-01-03").max, -100 / 13); // since: 130 -> 120
});

test("ratios: sabit getiride sapma 0 -> null; risksiz üstü getiri pozitif Sharpe", () => {
  const flat = new Map(Array.from({ length: 60 }, (_, i) => [String(i), 0.001]));
  assert.deepEqual(ratios(flat, 0.1), { sharpe: null, sortino: null });
  const h = series(300, (i) => 100 * 1.002 ** i * (1 + 0.01 * Math.sin(i)));
  const r = ratios(dailyReturns(h, "2025-01-01"), 0.1);
  assert.ok(r.sharpe > 0 && r.sortino > r.sharpe); // aşağı yönlü sapma toplamdan küçük
  assert.ok(ratios(dailyReturns(h, "2025-01-01"), 5).sharpe < 0); // %500 risksizi geçemez
  assert.deepEqual(ratios(new Map([["2025-01-02", 0.01]]), 0), { sharpe: null, sortino: null });
});

test("ratios: bilinen değer (dönüşümlü -1% / +2%)", () => {
  const m = new Map(Array.from({ length: 40 }, (_, i) => [String(i), i % 2 ? 0.02 : -0.01]));
  const sd = Math.sqrt((40 / 39) * 0.015 ** 2); // örneklem sapması
  near(ratios(m, 0).sharpe, (0.005 / sd) * Math.sqrt(252));
  near(ratios(m, 0).sortino, (0.005 / Math.sqrt(0.0001 / 2)) * Math.sqrt(252));
});

test("annualVol: dönüşümlü -1% / +2% ve az veri", () => {
  const m = new Map(Array.from({ length: 40 }, (_, i) => [String(i), i % 2 ? 0.02 : -0.01]));
  near(annualVol(m), Math.sqrt((40 / 39) * 0.015 ** 2 * 252) * 100);
  assert.equal(annualVol(new Map([["a", 0.1]])), null);
});

test("median ve rank", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.deepEqual(rank(30, [10, 50, 30, null, 20]), { rank: 2, n: 4, top: 50 });
  assert.deepEqual(rank(50, [10, 50, 30, 20]), { rank: 1, n: 4, top: 25 });
  assert.equal(rank(null, [1, 2]), null);
  assert.equal(rank(1, [1]), null); // kıyaslanacak rakip yok
});

// Her ay sonunda %1 artan basamaklı seri (ay içinde sabit), 2024-12-31 = 100
const monthEndStep = (n) => series(n, (i) => {
  const d = new Date(Date.parse("2024-12-31") + i * 864e5);
  const isLast = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() === d.getUTCDate();
  return 100 * 1.01 ** ((d.getUTCFullYear() - 2025) * 12 + d.getUTCMonth() + (isLast ? 1 : 0));
}, "2024-12-31");

test("calendar: aylık ve yıllık getiri, yeni yıl üstte", () => {
  const c = calendar(monthEndStep(400)); // 2024-12-31 .. 2026-02-04
  assert.deepEqual(c.map((r) => r.year), [2026, 2025]);
  for (const m of c[1].months) near(m, 1);
  near(c[1].total, (1.01 ** 12 - 1) * 100);
  near(c[0].months[0], 1); // 2026 Ocak
  assert.equal(c[0].months[1], 0); // Şubat sürüyor: son fiyat = Ocak sonu
  assert.equal(c[0].months[11], null); // gelecek
});

test("calendar: veri boşluğu olan ay ve yıl null", () => {
  // 2024-12-25..2025-02-09 ve 2025-03-15..2025-04-10: Şubat sonu fiyatı yok
  const gap = [...series(47, (i) => 100 + i, "2024-12-25"), ...series(27, () => 200, "2025-03-15")];
  const g = calendar(gap)[0];
  assert.equal(g.year, 2025);
  near(g.months[0], (137 / 106 - 1) * 100); // 31 Ara (i=6) -> 31 Oca (i=37)
  assert.equal(g.months[1], null);
  assert.equal(g.months[2], null); // Mart başlangıcı (Şubat sonu) yok
  near(g.months[3], 0); // 31 Mar -> 10 Nis (son fiyat)
  near(g.total, (200 / 106 - 1) * 100);
  assert.deepEqual(calendar(series(20, () => 1, "2025-05-03")), []); // tek ay, başlangıç yok
  assert.deepEqual(calendar([]), []);
});
