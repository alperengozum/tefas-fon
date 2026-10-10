// Varlık içeriği filtresi: grup toplamı, içersin/içermesin, dağılımı bilinmeyen fon
import { test } from "node:test";
import assert from "node:assert/strict";
import { assetOptions, matches, ruleText, share } from "../src/lib/assets.ts";

const a = { hs: 40, vmtl: 10, khtl: 15, tr: 35 };

test("grup payı üyelerin toplamı, tek kalem kendi payı", () => {
  assert.equal(share(a, "g:mevduat"), 25);
  assert.equal(share(a, "k:khtl"), 15);
  assert.equal(share(a, "g:kira"), 0);
});

test("içersin / en az % / içermesin", () => {
  assert.ok(matches(a, { a: "g:hisse", op: "has", min: 0 }));
  assert.ok(matches(a, { a: "g:mevduat", op: "has", min: 25 }));
  assert.ok(!matches(a, { a: "g:mevduat", op: "has", min: 30 }));
  assert.ok(matches(a, { a: "g:kira", op: "not", min: 0 }));
  assert.ok(!matches(a, { a: "k:hs", op: "not", min: 0 }));
});

test("dağılımı bilinmeyen fon hiçbir kurala uymaz", () => {
  assert.ok(!matches(null, { a: "g:kira", op: "not", min: 0 }));
  assert.ok(!matches(null, { a: "g:hisse", op: "has", min: 0 }));
});

test("seçenekler: grup + girintili kalemler, tek kalemli grup tekrarlanmaz, bilinmeyen kod sonda", () => {
  const o = assetOptions(new Set(["hs", "vmtl", "khtl", "zzz"]));
  assert.deepEqual(o.map((x) => x.value), ["g:hisse", "g:mevduat", "k:vmtl", "k:khtl", "k:zzz"]);
  assert.equal(ruleText({ a: "g:kira", op: "not", min: 0 }), "Kira Sertifikası içermesin");
  assert.equal(ruleText({ a: "k:hs", op: "has", min: 20 }), "Hisse Senedi ≥ %20");
});

