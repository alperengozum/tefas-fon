// Stopaj, stopaj sonrası net, yeniden dengeleme, portföy riski
import { test } from "node:test";
import assert from "node:assert/strict";
import { afterTax, portfolioRisk, rebalance, stopajRate } from "../src/lib/portfolio.ts";
import { simulate } from "../src/lib/stats.ts";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const fund = (kind, name, stock = 0) => ({ kind, name, stock, stockFocus: /HİSSE SENEDİ YOĞUN/.test(name) });
const series = (n, f, start = "2025-01-01") => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10), price: f(i) }));

test("stopajRate: fon türü ve elde tutma süresine göre", () => {
  const ppf = fund("YAT", "ALFA PORTFÖY PARA PİYASASI FONU");
  assert.equal(stopajRate(ppf, "2025-08-01", "2027-08-01"), 0.175); // süre fark etmez
  const hyf = fund("YAT", "ALFA PORTFÖY HİSSE SENEDİ YOĞUN FON", 85);
  assert.equal(stopajRate(hyf, "2025-08-01", "2025-09-01"), 0);
  const shyf = fund("YAT", "ALFA PORTFÖY SERBEST (HİSSE SENEDİ YOĞUN) FON", 85);
  assert.equal(stopajRate(shyf, "2026-03-26", "2026-05-01"), 0); // 27.03.2026 öncesi alım
  assert.equal(stopajRate(shyf, "2026-03-27", "2026-05-01"), 0.175);
  const byf = fund("BYF", "ALFA PORTFÖY BIST 30 BORSA YATIRIM FONU", 98);
  assert.equal(stopajRate(byf, "2025-08-01", "2026-08-01"), 0.175); // tam 365 gün: "1 yıldan fazla" değil
  assert.equal(stopajRate(byf, "2025-08-01", "2026-08-02"), 0);
  assert.equal(stopajRate(fund("BYF", "ALTIN BYF", 0), "2025-08-01", "2027-08-02"), 0.175); // hisse < %51
  assert.equal(stopajRate(fund("GYF", "GAMA GAYRİMENKUL YATIRIM FONU"), "2025-08-01", "2027-08-01"), 0.175);
  assert.equal(stopajRate(fund("GSYF", "X GİRİŞİM SERMAYESİ YATIRIM FONU"), "2025-08-01", "2027-08-02"), 0);
  assert.equal(stopajRate(fund("EMK", "X EMEKLİLİK YATIRIM FONU"), "2025-08-01", "2026-08-01"), null);
});

test("afterTax: yalnız kazançlı lot vergilenir; BES vergisiz", () => {
  const lots = [{ date: "2025-08-01", units: 10, cost: 100 }, { date: "2025-09-01", units: 5, cost: 100 }];
  const r = afterTax(fund("YAT", "PARA PİYASASI"), lots, 15, "2025-12-01"); // 150 (+50) ve 75 (-25)
  near(r.gross, 225);
  near(r.tax, 50 * 0.175);
  near(r.net, 225 - 8.75);
  assert.equal(afterTax(fund("EMK", "BES"), lots, 15, "2025-12-01").tax, 0);
});

test("simulate lotları afterTax ile tutarlı: SIP değeri = lotların değeri", () => {
  const h = series(200, (i) => 10 * 1.002 ** i, "2025-08-01");
  const s = simulate(h, 1000, "2025-08-01", "2026-02-01");
  assert.equal(s.lots.length, s.n);
  near(s.lots.reduce((a, l) => a + l.cost, 0), s.invested);
  const t = afterTax(fund("YAT", "DEĞİŞKEN"), s.lots, h.findLast((r) => r.date <= "2026-02-01").price, s.last);
  near(t.gross, s.value, 1e-6);
  near(t.tax, (s.value - s.invested) * 0.175, 1e-6); // hepsi kazançlı
});

test("rebalance: al/sat ile tam hedef, toplam korunur", () => {
  const t = rebalance([{ code: "A", value: 700, target: 50 }, { code: "B", value: 300, target: 50 }]);
  assert.deepEqual(t.map((x) => x.amount), [-200, 200]);
  assert.deepEqual(t.map((x) => x.after), [500, 500]);
  const c = rebalance([{ code: "A", value: 700, target: 60 }, { code: "B", value: 300, target: 40 }], 1000); // toplam 2000
  assert.deepEqual(c.map((x) => x.after), [1200, 800]);
  const n = rebalance([{ code: "A", value: 70, target: 3 }, { code: "B", value: 30, target: 1 }]); // 75/25'e oranlanır
  near(n[0].target, 75);
  assert.deepEqual(rebalance([{ code: "A", value: 1, target: 0 }]), []);
});

test("rebalance noSell: satış yok, yeni para açıklar oranında", () => {
  const rows = [{ code: "A", value: 700, target: 50 }, { code: "B", value: 300, target: 50 }];
  assert.deepEqual(rebalance(rows, 100, true).map((x) => x.amount), [0, 100]); // toplam 1100: A fazla, B açığı 250
  const more = rebalance(rows, 600, true); // toplam 1600, hedef 800/800: açıklar 100/500 = nakit
  assert.deepEqual(more.map((x) => x.after), [800, 800]);
  assert.deepEqual(rebalance(rows, 0, true).map((x) => x.amount), [0, 0]); // nakitsiz: işlem yok
  const two = rebalance([{ code: "A", value: 100, target: 50 }, { code: "B", value: 100, target: 25 }, { code: "C", value: 0, target: 25 }], 200, true);
  near(two.reduce((s, x) => s + x.amount, 0), 200); // nakit tamamen kullanılır
  near(two[2].amount, 100); // toplam 400: C hedefi 100, açığı 100; A açığı 100 -> eşit
});

test("portfolioRisk: tek fon = kendi volatilitesi; zıt iki fon riski sıfırlar", () => {
  const a = new Map(Array.from({ length: 40 }, (_, i) => [String(i), i % 2 ? 0.02 : -0.01]));
  const one = portfolioRisk([1], [a]);
  near(one.vol, Math.sqrt((40 / 39) * 0.015 ** 2 * 252) * 100);
  near(one.contrib[0], 100);
  near(one.div, 1);
  const neg = new Map([...a].map(([d, v]) => [d, 0.005 - (v - 0.005)])); // ortalama etrafında ayna
  assert.equal(portfolioRisk([1, 1], [a, neg]), null); // varyans 0
  const b = new Map([...a].map(([d, v], i) => [d, i % 4 < 2 ? v : -v]));
  const mix = portfolioRisk([3, 1], [a, b]);
  near(mix.contrib[0] + mix.contrib[1], 100);
  assert.ok(mix.div > 1 && mix.vol < one.vol); // çeşitlendirme riski azaltır
  assert.equal(portfolioRisk([1], [new Map([["x", 1]])]), null); // az ortak gün
});
