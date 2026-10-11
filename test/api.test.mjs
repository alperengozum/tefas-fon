// Herkese açık API (/api/v1) ve MCP: sorgu katmanı, JSON-RPC işleyici, araçlar (sahte DB ile)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, makeApi, normCode, normTicker, parseKind, parseSort, searchFunds, summary } from "../src/lib/api.ts";
import { handleMessage, PROTOCOL_VERSIONS } from "../src/lib/mcp.ts";
import { mcpTools } from "../src/lib/mcpTools.ts";

const fund = (o) => ({
  code: "AAA", kind: "YAT", name: "ALFA PORTFÖY PARA PİYASASI FONU", price: 1.5, size: 1e8, investors: 100, stock: 0, active: true, alloc: null,
  founder: "ALFA PORTFÖY", type: "Para Piyasası", fx: false, islamic: false, qualified: false, stockFocus: false, oks: false,
  vol: 1.2, risk: 1, mdd: -0.5, d1: 0.1, w1: 0.5, m1: 2, m3: 6, m6: 12, y1: 30, y2: null, y3: null, y5: null, ytd: 20,
  flow_w1: 1000.4, flow_m1: -5000, flow_m3: null, ...o,
});
const FUNDS = [
  fund({}),
  fund({ code: "BBB", name: "BETA PORTFÖY HİSSE SENEDİ FONU", founder: "BETA PORTFÖY", type: "Hisse Senedi", size: 5e8, y1: 50, vol: 25 }),
  fund({ code: "CCC", name: "BETA PORTFÖY ALTIN FONU", founder: "BETA PORTFÖY", type: "Kıymetli Maden", size: 2e8, y1: null }),
  fund({ code: "DDD", name: "İŞ PORTFÖY ESKİ FON", founder: "İŞ PORTFÖY", active: false, size: 9e9, y1: 99 }),
];

test("summary: İngilizce sabit alanlar, tür kısa adı, yuvarlama", () => {
  const s = summary(FUNDS[0]);
  assert.equal(s.kind, "yat");
  assert.equal(s.returns.y1, 30);
  assert.equal(s.flows.w1, 1000);
  assert.deepEqual(s.risk, { score: 1, volatility: 1.2, max_drawdown_1y: -0.5 });
  assert.equal(s.url, "/fon/AAA");
});

test("searchFunds: pasifleri dışlar, büyüklüğe göre sıralar, boş değerler sonda", () => {
  assert.deepEqual(searchFunds(FUNDS).items.map((f) => f.code), ["BBB", "CCC", "AAA"]);
  assert.equal(searchFunds(FUNDS, { activeOnly: false }).items[0].code, "DDD");
  assert.deepEqual(searchFunds(FUNDS, { sort: "y1" }).items.map((f) => f.code), ["BBB", "AAA", "CCC"]);
  assert.deepEqual(searchFunds(FUNDS, { sort: "y1", order: "asc" }).items.map((f) => f.code), ["AAA", "BBB", "CCC"]);
  assert.equal(searchFunds(FUNDS, { sort: "volatility" }).items[0].code, "BBB");
});

test("searchFunds: Türkçe harf duyarsız arama, tip/kurucu filtresi, sayfalama", () => {
  assert.deepEqual(searchFunds(FUNDS, { query: "altın" }).items.map((f) => f.code), ["CCC"]);
  assert.deepEqual(searchFunds(FUNDS, { query: "ALTIN" }).items.map((f) => f.code), ["CCC"]);
  assert.deepEqual(searchFunds(FUNDS, { query: "iş portföy", activeOnly: false }).items.map((f) => f.code), ["DDD"]);
  assert.deepEqual(searchFunds(FUNDS, { founder: "beta" }).items.map((f) => f.code), ["BBB", "CCC"]);
  assert.deepEqual(searchFunds(FUNDS, { type: "hisse" }).items.map((f) => f.code), ["BBB"]);
  const page = searchFunds(FUNDS, { limit: 1, offset: 1 });
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map((f) => f.code), ["CCC"]);
  assert.equal(searchFunds(FUNDS, { limit: 1000 }).items.length, 3); // en fazla 100
});

test("doğrulayıcılar: kod, hisse, tür, sıralama", () => {
  assert.equal(normCode(" aft "), "AFT");
  assert.throws(() => normCode("../x"), ApiError);
  assert.equal(normTicker("thyao"), "THYAO");
  assert.throws(() => normTicker("x"), (e) => e instanceof ApiError && e.status === 400);
  assert.deepEqual(parseKind("bes"), ["EMK"]);
  assert.equal(parseKind(undefined).length, 4);
  assert.throws(() => parseKind("xyz"), ApiError);
  assert.equal(parseSort("y1"), "y1");
  assert.equal(parseSort(""), undefined);
  assert.throws(() => parseSort("drop table"), ApiError);
});

// Sahte DB: 400 günlük doğrusal fiyat
const hist = (base, step) => Array.from({ length: 400 }, (_, i) => ({
  date: new Date(Date.now() - (399 - i) * 864e5).toISOString().slice(0, 10), price: base + step * i + (i % 3) * 0.01, size: 1e8, investors: 10, shares: 1e6,
}));
const db = {
  listFunds: async (kind) => ({ ref: "2026-10-09", funds: FUNDS.filter((f) => f.kind === kind) }),
  getFund: async (code) => (FUNDS.some((f) => f.code === code) ? { code, name: `${code} FON`, kind: "YAT", history: hist(1, code === "BBB" ? 0.01 : 0.001), alloc: { hs: 90, r: 10 }, allocDate: "2026-10-09", active: true, tasfiye: null } : null),
  getHoldings: async () => ({ holdings: [{ ticker: "THYAO", weight: 8.234 }], report: "2026/09", published: "2026-10-01" }),
  getBench: async () => ({ BIST100: hist(10000, 5) }),
  tickerFunds: async () => [{ code: "BBB", name: "BETA", kind: "YAT", weight: 8.2, size: 5e8, amount: 4.1e7 }, { code: "EEE", name: "E", kind: "EMK", weight: 0.5, size: 1e8, amount: 5e5 }],
};
const api = makeApi(db);

test("makeApi.fund: detay, endeks getirileri, dağılım etiketleri, geçmiş; bilinmeyen 404", async () => {
  const d = await api.fund("BBB", 30);
  assert.equal(d.code, "BBB");
  assert.equal(d.type, "Hisse Senedi");
  assert.ok(d.returns.y1 > 0);
  assert.ok(d.benchmarks.BIST100.returns.m1 != null);
  assert.deepEqual(d.allocation.items[0], { key: "hs", name: "Hisse Senedi", pct: 90 });
  assert.deepEqual(d.holdings.items, [{ ticker: "THYAO", weight: 8.23 }]);
  assert.ok(d.history.length >= 30 && d.history.length <= 31);
  assert.equal((await api.fund("BBB")).history, undefined);
  await assert.rejects(api.fund("ZZZ"), (e) => e instanceof ApiError && e.status === 404);
});

test("makeApi: hisse, karşılaştırma, tarama", async () => {
  const s = await api.stockFunds("THYAO", 1);
  assert.deepEqual(s.items.map((r) => [r.code, r.kind]), [["BBB", "yat"]]);
  const c = await api.compare(["aaa", "BBB", "ZZZ"]);
  assert.deepEqual(c.missing, ["ZZZ"]);
  assert.equal(c.correlation_1y.matrix[0][0], 1);
  await assert.rejects(api.compare(["AAA"]), ApiError);
  const sc = await api.scan("en-buyuk-fonlar", 2);
  assert.deepEqual(sc.items.map((f) => f.code), ["BBB", "CCC"]);
  await assert.rejects(api.scan("yok"), (e) => e.status === 404);
});

const tools = mcpTools(api);
const call = (method, params, id = 1) => handleMessage({ jsonrpc: "2.0", id, method, params }, tools);

test("mcp: initialize sürüm anlaşması, ping, bildirim", async () => {
  const r = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.equal(r.result.protocolVersion, "2025-06-18");
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } });
  assert.equal((await call("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.deepEqual((await call("ping")).result, {});
  assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, tools), null);
});

test("mcp: hatalı istek, bilinmeyen metot ve araç", async () => {
  assert.equal((await handleMessage([1, 2], tools)).error.code, -32600);
  assert.equal((await handleMessage({ id: 1, method: "ping" }, tools)).error.code, -32600);
  assert.equal((await call("resources/list")).error.code, -32601);
  assert.equal((await call("tools/call", { name: "yok" })).error.code, -32602);
  assert.equal((await call("tools/call", { name: "get_fund", arguments: [] })).error.code, -32602);
});

test("mcp: tools/list şemaları ve salt-okur ipuçları", async () => {
  const { tools: list } = (await call("tools/list")).result;
  assert.deepEqual(list.map((t) => t.name), ["search_funds", "get_fund", "funds_holding_stock", "compare_funds", "run_scan"]);
  for (const t of list) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(typeof t.description, "string");
  }
});

test("mcp: tools/call sonuç metni + structuredContent; kullanıcı hatası isError", async () => {
  const r = (await call("tools/call", { name: "search_funds", arguments: { query: "beta", sort_by: "y1", limit: 5 } })).result;
  assert.equal(r.isError, false);
  assert.deepEqual(r.structuredContent.items.map((f) => f.code), ["BBB", "CCC"]);
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
  const g = (await call("tools/call", { name: "get_fund", arguments: { code: "bbb" } })).result;
  assert.equal(g.structuredContent.code, "BBB");
  const bad = (await call("tools/call", { name: "get_fund", arguments: { code: "ZZZ" } })).result;
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /bulunamadı/);
  const badSort = (await call("tools/call", { name: "search_funds", arguments: { sort_by: "x" } })).result;
  assert.equal(badSort.isError, true);
  const badLimit = (await call("tools/call", { name: "search_funds", arguments: { limit: 500 } })).result;
  assert.equal(badLimit.isError, true);
  const h = (await call("tools/call", { name: "funds_holding_stock", arguments: { ticker: "thyao" } })).result;
  assert.equal(h.structuredContent.count, 2);
  const c = (await call("tools/call", { name: "compare_funds", arguments: { codes: "AAA" } })).result;
  assert.equal(c.isError, true);
  const s = (await call("tools/call", { name: "run_scan", arguments: { slug: "en-buyuk-fonlar", limit: 1 } })).result;
  assert.deepEqual(s.structuredContent.items.map((f) => f.code), ["BBB"]);
});
