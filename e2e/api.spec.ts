import { expect, test } from "@playwright/test";

// Herkese açık API (/api/v1), OpenAPI, MCP (/mcp) ve doküman sayfası. Veri: e2e/seed.sql
test("/api/v1/funds: arama, sıralama, CORS ve önbellek başlığı", async ({ request }) => {
  const r = await request.get("/api/v1/funds?kind=yat&sort=y1&limit=3");
  expect(r.status()).toBe(200);
  expect(r.headers()["access-control-allow-origin"]).toBe("*");
  expect(r.headers()["cache-control"]).toContain("max-age=300");
  const b = await r.json();
  expect(b.items).toHaveLength(3);
  expect(b.total).toBeGreaterThan(3);
  expect(b.items[0]).toMatchObject({ kind: "yat", url: expect.stringMatching(/^\/fon\//) });
  const y = b.items.map((f: { returns: { y1: number } }) => f.returns.y1);
  expect([...y].sort((a, c) => c - a)).toEqual(y);
  const q = await (await request.get("/api/v1/funds?q=altın")).json();
  expect(q.items.map((f: { code: string }) => f.code)).toEqual(["DDD"]);
  expect((await request.get("/api/v1/funds?kind=xyz")).status()).toBe(400);
  expect((await request.get("/api/v1/funds?sort=x")).status()).toBe(400);
});

test("/api/v1/funds/{code}: detay, geçmiş, 404", async ({ request }) => {
  const d = await (await request.get("/api/v1/funds/bbb?history=10")).json();
  expect(d.code).toBe("BBB");
  expect(d.holdings.items.map((h: { ticker: string }) => h.ticker)).toContain("THYAO");
  expect(d.benchmarks.BIST100.name).toBe("BIST 100");
  expect(d.history.length).toBeGreaterThanOrEqual(10);
  const nf = await request.get("/api/v1/funds/ZZZ");
  expect(nf.status()).toBe(404);
  expect((await nf.json()).error).toContain("ZZZ");
});

test("/api/v1: hisse, karşılaştırma, tarama, OpenAPI", async ({ request }) => {
  const s = await (await request.get("/api/v1/stocks/EREGL")).json();
  expect(s.items.map((r: { code: string }) => r.code).sort()).toEqual(["BBB", "EEE"]);
  const c = await (await request.get("/api/v1/compare?codes=AAA,BBB")).json();
  expect(c.correlation_1y.codes).toEqual(["AAA", "BBB"]);
  expect((await request.get("/api/v1/compare?codes=AAA")).status()).toBe(400);
  expect((await request.get("/api/v1/scans/en-buyuk-fonlar")).ok()).toBeTruthy();
  const o = await (await request.get("/api/v1/openapi.json")).json();
  expect(o.openapi).toBe("3.1.0");
  expect(Object.keys(o.paths)).toContain("/api/v1/funds/{code}");
});

const rpc = (id: number | undefined, method: string, params?: object) => ({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params });
const HDR = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

test("MCP: initialize -> initialized -> tools/list -> tools/call", async ({ request }) => {
  const init = await request.post("/mcp", { headers: HDR, data: rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } }) });
  expect(init.status()).toBe(200);
  expect(init.headers()["content-type"]).toContain("application/json");
  expect((await init.json()).result.serverInfo.name).toBe("tefas-fon");
  const note = await request.post("/mcp", { headers: HDR, data: rpc(undefined, "notifications/initialized") });
  expect(note.status()).toBe(202);
  const list = await (await request.post("/mcp", { headers: HDR, data: rpc(2, "tools/list") })).json();
  expect(list.result.tools.map((t: { name: string }) => t.name)).toContain("get_fund");
  const call = await (await request.post("/mcp", { headers: HDR, data: rpc(3, "tools/call", { name: "get_fund", arguments: { code: "BBB" } }) })).json();
  expect(call.id).toBe(3);
  expect(call.result.isError).toBe(false);
  expect(call.result.structuredContent.code).toBe("BBB");
  const miss = await (await request.post("/mcp", { headers: HDR, data: rpc(4, "tools/call", { name: "get_fund", arguments: { code: "ZZZ" } }) })).json();
  expect(miss.result.isError).toBe(true);
});

test("MCP: bozuk JSON 400, GET 405, CORS ön kontrolü", async ({ request }) => {
  const bad = await request.post("/mcp", { headers: HDR, data: Buffer.from("{bozuk") });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe(-32700);
  expect((await request.get("/mcp")).status()).toBe(405);
  const pre = await request.fetch("/mcp", { method: "OPTIONS", headers: { Origin: "https://x.example", "Access-Control-Request-Method": "POST" } });
  expect(pre.status()).toBe(204);
  expect(pre.headers()["access-control-allow-headers"]).toContain("Mcp-Protocol-Version");
});

test("API sınırı: IP başına dakikada 60, sonra JSON 429 + Retry-After", async ({ request }) => {
  const headers = { "cf-connecting-ip": "203.0.113.77" };
  const first = await request.get("/api/v1/openapi.json", { headers });
  expect(first.headers()["x-ratelimit-limit"]).toBe("60");
  expect(first.headers()["x-ratelimit-remaining"]).toBe("59");
  // site geneli sınırı (10 sn'de 50) bu IP'yi önce durdurmasın diye istekleri iki pencereye yay
  for (let i = 0; i < 45; i++) await request.get("/api/v1/openapi.json", { headers });
  await new Promise((r) => setTimeout(r, 10_500));
  let last;
  for (let i = 0; i < 15; i++) last = await request.get("/api/v1/openapi.json", { headers });
  expect(last!.status()).toBe(429);
  expect(last!.headers()["retry-after"]).toBeTruthy();
  expect((await last!.json()).error).toContain("60");
});

test("doküman sayfası, footer linki ve llms.txt", async ({ page, request }) => {
  await page.goto("/fonlar/yat");
  await page.locator("footer").getByRole("link", { name: "API ve MCP" }).click();
  await expect(page.locator("h1")).toHaveText("API ve MCP");
  await expect(page.locator("pre").filter({ hasText: "claude mcp add" })).toContainText("/mcp");
  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toContain("/api/v1/funds/{KOD}");
  expect(llms).toContain("/mcp");
});
