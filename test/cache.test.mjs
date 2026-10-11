// cache.ts: TTL + LRU tahliyesi, hatanın önbelleklenmemesi
import { test } from "node:test";
import assert from "node:assert/strict";
import { cached } from "../src/lib/cache.ts";

const setup = (max = 2) => {
  let t = 0, calls = [];
  const f = cached(async (k) => { calls.push(k); return k; }, (k) => k, 100, max, () => t);
  return { f, calls, tick: (d) => (t += d) };
};

test("TTL içinde aynı anahtar tekrar hesaplanmaz, sonra yenilenir", async () => {
  const { f, calls, tick } = setup();
  await f("a"); await f("a");
  assert.deepEqual(calls, ["a"]);
  tick(100); await f("a");
  assert.deepEqual(calls, ["a", "a"]);
});

test("kapasite aşılınca en az yakın zamanda kullanılan atılır", async () => {
  const { f, calls } = setup(2);
  await f("a"); await f("b");
  await f("a"); // a kullanıldı: artık en eski b
  await f("c"); // b atılır
  await f("a");
  assert.deepEqual(calls, ["a", "b", "c"]);
  await f("b");
  assert.deepEqual(calls, ["a", "b", "c", "b"]);
});

test("hata önbelleklenmez", async () => {
  let n = 0;
  const f = cached(async () => { if (n++ === 0) throw new Error("x"); return 1; }, () => "k", 1000);
  await assert.rejects(f());
  assert.equal(await f(), 1);
});
