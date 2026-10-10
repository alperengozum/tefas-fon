// Fon listesi durumu <-> adres
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SORT, EMPTY, fromQuery, toQuery } from "../src/lib/listUrl.ts";

const VIEWS = ["getiri", "buyukluk", "risk", "nakit"];
const state = (f = {}, view = "getiri", sort = DEFAULT_SORT) => ({ f: { ...EMPTY, ...f }, view, sort });

test("varsayılan durum boş adres; boş adres varsayılan durum", () => {
  assert.equal(toQuery(state()), "");
  assert.deepEqual(fromQuery("", VIEWS), state());
});

test("tüm alanlar gidiş-dönüş aynı kalır", () => {
  const s = state({
    q: "altın", status: "", type: "Hisse Senedi", founder: "AK PORTFÖY", flags: ["fx", "islamic"], riskMin: "1", riskMax: "3", invMin: "100", sizeMax: "500",
    stockMin: "50", stock: "EREGL", stockW: "2", assets: [{ a: "g:hisse", op: "has", min: 10 }, { a: "k:vm", op: "not", min: 0 }],
  }, "risk", { key: "y1", dir: -1 });
  const q = toQuery(s);
  assert.deepEqual(fromQuery(q, VIEWS), s);
  assert.match(q, /durum=hepsi/);
  assert.match(q, /risk=1-3/);
  assert.match(q, /yatirimci=100-(&|$)/);
  assert.match(q, /buyukluk=-500/);
  assert.match(q, /varlik=has%3Ag%3Ahisse%3A10%2Cnot%3Ak%3Avm/);
  assert.match(q, /gorunum=risk/);
  assert.match(q, /sirala=y1(&|$)/);
});

test("artan sıralama ve varlık sütunu anahtarı", () => {
  const s = state({}, "getiri", { key: "@g:mevduat", dir: 1 });
  assert.equal(toQuery(s), "sirala=%40g%3Amevduat-artan");
  assert.deepEqual(fromQuery(toQuery(s), VIEWS).sort, { key: "@g:mevduat", dir: 1 });
});

test("eski ?hisse=EREGL bağlantısı en az %1 ağırlıkla açılır; küçük harf ve çöp karakter temizlenir", () => {
  const { f } = fromQuery("?hisse=eregl", VIEWS);
  assert.equal(f.stock, "EREGL");
  assert.equal(f.stockW, "1");
  assert.equal(fromQuery("?hisse=th<y>ao&hisseMin=0", VIEWS).f.stock, "THYAO");
});

test("bozuk değerler sessizce atlanır", () => {
  const s = fromQuery("?risk=a-b&gorunum=yok&durum=x&varlik=has:g:hisse:xx,bad,not:&bayrak=fx,<script>&hisseOran=-", VIEWS);
  assert.equal(s.f.riskMin, "");
  assert.equal(s.view, "getiri");
  assert.equal(s.f.status, "aktif");
  assert.deepEqual(s.f.assets, []);
  assert.deepEqual(s.f.flags, ["fx"]);
  assert.equal(s.f.stockMin, "");
});
