import { expect, test } from "@playwright/test";

// SEO: robots/llms/sitemap, sayfa başı meta + JSON-LD, fon OG görseli, hazır taramalar, noindex
test("robots.txt AI tarayıcılarına açık; llms.txt markdown; sitemap fon/hisse/tarama sayfalarını listeler", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("User-agent: ClaudeBot\nAllow: /");
  expect(robots).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/markdown");
  expect(await llms.text()).toContain("/api/holdings?ticker=EREGL&min=1");
  const sm = await request.get("/sitemap.xml");
  expect(sm.headers()["content-type"]).toContain("application/xml");
  const xml = await sm.text();
  for (const p of ["/fon/AAA<", "/fon/EMA<", "/fonlar/yat<", "/tarama/en-buyuk-fonlar<", "/hisse/EREGL<"]) expect(xml).toContain(p);
  expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test("fon detayı: kanonik büyük harf ve sorgusuz, açıklama, fon OG görseli, JSON-LD", async ({ page, request }) => {
  await page.goto("/fon/aaa?x=1");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^?]+\/fon\/AAA$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^AAA ALFA PORTFÖY PARA PİYASASI.*1 yıllık getiri [+-]\d/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\/.+\/og\/fon\/AAA\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
  expect(ld["@graph"].map((g: { "@type": string }) => g["@type"])).toEqual(["WebSite", "WebPage", "BreadcrumbList"]);
  expect(ld["@graph"][1]["@id"]).toMatch(/\/fon\/AAA#webpage$/);
  const img = await request.get("/og/fon/aaa.png");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  const b = await img.body();
  expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630]); // PNG IHDR genişlik/yükseklik
  expect((await request.get("/og/fon/ZZZZZZ.png")).status()).toBe(404);
});

test("hazır taramalar: listeden açılır, tablo fon detayına bağlanır; bilinmeyen 404", async ({ page }) => {
  await page.goto("/fonlar/yat");
  await page.getByTestId("hazir-taramalar").getByRole("link", { name: "En büyük yatırım fonları" }).click();
  await expect(page).toHaveURL(/\/tarama\/en-buyuk-fonlar$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("En büyük yatırım fonları");
  const rows = page.getByTestId("tarama-tablo").locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/fon\/[A-Z0-9]+$/);
  await page.goto("/tarama");
  await expect(page.getByRole("link", { name: /En büyük yatırım fonları/ })).toBeVisible();
  expect((await page.request.get("/tarama/yok-boyle-tarama")).status()).toBe(404);
});

test("katılıma uygun fonlar taraması: seed'deki katılım fonu var, diğerleri yok", async ({ page, request }) => {
  await page.goto("/tarama/katilim-fonlari");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Katılıma uygun fonlar");
  const table = page.getByTestId("tarama-tablo");
  await expect(table.getByRole("link", { name: /DDD BETA PORTFÖY ALTIN KATILIM FONU/ })).toBeVisible(); // seed: 11 mn ₺, aktif
  await expect(table.getByRole("link", { name: /BBB/ })).toHaveCount(0);
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/tarama/katilim-bes-fonlari<");
});

test("sorgulu araç sayfaları noindex, sorgusuz hali index", async ({ page }) => {
  await page.goto("/portfoy?f=AAA:tl:1000");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await page.goto("/portfoy");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
});
