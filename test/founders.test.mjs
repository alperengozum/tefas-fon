// Kurucu özeti
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, slug } from "../src/lib/founders.ts";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const f = (code, founder, o = {}) => ({ code, name: code, founder, type: "Hisse Senedi", active: true, size: 100, investors: 10, y1: 10, m1: 1, flow_m1: 5, ...o });

test("slug: Türkçe harfler, İ/I farkı, boşluk ve noktalama", () => {
  assert.equal(slug("AK PORTFÖY"), "ak-portfoy");
  assert.equal(slug("AZİMUT PORTFÖY"), slug("AZIMUT PORTFÖY"));
  assert.equal(slug("ÇAĞ & ŞÜKRÜ Portföy A.Ş."), "cag-sukru-portfoy-a-s");
  assert.equal(slug("TEST EMEKLİLİK VE HAYAT A.Ş."), "test-emeklilik-ve-hayat-a-s");
});

test("aggregate: aktif fonlar, büyüklük ağırlıklı ve medyan getiri, nakit toplamı, büyüklüğe göre sıra", () => {
  const rows = aggregate([
    f("A1", "ALFA", { size: 300, y1: 20 }), f("A2", "ALFA", { size: 100, y1: 0, type: "Para Piyasası", flow_m1: -15 }), f("A3", "ALFA", { size: 50, y1: null }),
    f("A4", "ALFA", { size: 1000, active: false }), // pasif sayılmaz
    f("B1", "BETA", { size: 50 }),
  ]);
  assert.deepEqual(rows.map((r) => r.founder), ["ALFA", "BETA"]);
  const a = rows[0];
  assert.equal(a.count, 3);
  assert.equal(a.size, 450);
  near(a.y1, (300 * 20 + 100 * 0) / 400); // y1 olmayan fon ağırlığa girmez
  assert.equal(a.y1Median, 10);
  assert.equal(a.flow_m1, 5 - 15 + 5);
  assert.deepEqual(a.types.map((t) => [t.type, t.count, t.size]), [["Hisse Senedi", 2, 350], ["Para Piyasası", 1, 100]]);
  assert.equal(a.slug, "alfa");
});

test("aggregate: getirisi olmayan kurucu null; kurucusuz fon atlanır", () => {
  const [r] = aggregate([f("X", "GAMA", { y1: null }), f("Y", "", {})]);
  assert.equal(r.y1, null);
  assert.equal(r.y1Median, null);
  assert.equal(aggregate([f("Y", "")]).length, 0);
});
