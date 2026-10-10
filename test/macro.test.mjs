// Makro seriler: TÜFE baz zincirleme, günlük TÜFE/mevduat serisi, reel getiri, EVDS ayrıştırma
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainCpi, cpiDaily, depositDaily, real } from "../src/lib/macro.ts";
import { parseEvds } from "../scripts/evds.mjs";
import { ret } from "../src/lib/analytics.ts";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

test("chainCpi: eski bazdan yeni baza aylık değişimlerle geçer", () => {
  const old = [{ date: "2025-10-31", value: 3000 }, { date: "2025-11-30", value: 3030 }, { date: "2025-12-31", value: 3060.3 }];
  const next = [{ date: "2025-12-31", value: 100 }, { date: "2026-01-31", value: 105 }, { date: "2026-02-28", value: 107.1 }];
  const c = chainCpi(old, next);
  assert.deepEqual(c.map((o) => o.date), ["2025-10-31", "2025-11-30", "2025-12-31", "2026-01-31", "2026-02-28"]);
  near(c[2].value, 3060.3);
  near(c[3].value, 3060.3 * 1.05); // Ocak: yeni serinin %5'i
  near(c[4].value, 3060.3 * 1.05 * 1.02);
});

test("chainCpi: tek seri, sıralama, tekrar eden ay ve boşlukta durma", () => {
  assert.deepEqual(chainCpi([], [{ date: "2026-01-15", value: 1 }]), [{ date: "2026-01-31", value: 1 }]); // ay sonuna çekilir
  const gap = chainCpi([{ date: "2025-03-31", value: 10 }, { date: "2025-01-31", value: 8 }, { date: "2025-02-28", value: 9 }, { date: "2025-06-30", value: 12 }], []);
  assert.deepEqual(gap.map((o) => o.value), [8, 9, 10, 12]); // sıralı; tek seride oranlar ardışık gözlemlerden
  const hole = chainCpi([{ date: "2025-01-31", value: 8 }], [{ date: "2025-04-30", value: 100 }, { date: "2025-05-31", value: 101 }]);
  assert.deepEqual(hole.map((o) => o.date), ["2025-01-31"]); // Şubat-Nisan arası değişim yok -> zincir kesilir
});

test("cpiDaily: ay sonunda resmi değer, arada geometrik, sonrası son aylık değişimle", () => {
  const cpi = [{ date: "2025-01-31", value: 100 }, { date: "2025-02-28", value: 110 }];
  const d = cpiDaily(cpi, "2025-03-30");
  assert.equal(d[0].date, "2025-01-31");
  near(d.find((p) => p.date === "2025-02-28").price, 110);
  near(d.find((p) => p.date === "2025-02-14").price, 100 * 1.1 ** (14 / 28));
  near(d.at(-1).price, 110 * 1.1 ** (30 / 30.4375));
  assert.equal(d.at(-1).date, "2025-03-30");
  assert.deepEqual(cpiDaily(cpi.slice(0, 1), "2025-03-01"), []);
});

test("depositDaily: %36.5 yıllıkta her gün %0.1, faiz değişince yeni oran", () => {
  const d = depositDaily([{ date: "2025-01-01", value: 36.5 }, { date: "2025-01-11", value: 0 }], "2025-01-20");
  assert.equal(d[0].price, 100);
  near(d.find((p) => p.date === "2025-01-10").price, 100 * 1.001 ** 9);
  near(d.at(-1).price, 100 * 1.001 ** 9); // 11'inden sonra faiz 0
  assert.equal(d.length, 20);
});

test("real: nominal %50, enflasyon %40 -> reel ~%7.14; eksik veri null", () => {
  near(real(50, 40), (1.5 / 1.4 - 1) * 100);
  assert.equal(real(null, 40), null);
  assert.equal(real(10, null), null);
});

test("günlük TÜFE serisi ret() ile yıllık enflasyon verir", () => {
  const cpi = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2024, 11 + i, 0)).toISOString().slice(0, 10), value: 100 * 1.03 ** i }));
  const h = cpiDaily(cpi, "2026-01-31");
  near(ret(h, 365), (1.03 ** 12 - 1) * 100, 0.5); // 365 gün ≈ 12 ay
});

test("parseEvds: aylık ve haftalık tarih, boş değer atlanır", () => {
  const items = [
    { Tarih: "2025-1", TP_FG_J0: "3000.5", UNIXTIME: "x" },
    { Tarih: "2025-12", TP_FG_J0: null },
    { Tarih: "14-03-2025", TP_FG_J0: "41.2" },
    { Tarih: "garip", TP_FG_J0: "1" },
  ];
  assert.deepEqual(parseEvds(items, "TP.FG.J0"), [{ date: "2025-01-31", value: 3000.5 }, { date: "2025-03-14", value: 41.2 }]);
});
