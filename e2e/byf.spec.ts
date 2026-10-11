import { expect, test } from "@playwright/test";

// BYF prim/iskonto (seed: BYA borsa bülten fiyatı, son gün +%0,5)
test("BYF detay: borsa fiyatı, NAV, prim/iskonto kartları ve grafik", async ({ page }) => {
  await page.goto("/fon/BYA");
  const s = page.locator('[data-section="prim"]');
  await expect(s.locator("h2")).toContainText("prim/iskonto");
  await expect(s).toContainText("Borsa fiyatı");
  await expect(s).toContainText("+0.50%");
  await expect(s).toContainText("üstünde (primli)");
  await expect(s.locator(".recharts-line-curve")).toBeVisible();
});

test("BYF olmayan fonda prim bölümü yok", async ({ page }) => {
  await page.goto("/fon/BBB");
  await expect(page.locator("h1")).toContainText("BBB");
  await expect(page.locator('[data-section="prim"]')).toHaveCount(0);
});

test("BYF listesi: Büyüklük görünümünde Prim/İskonto sütunu, diğer listelerde yok", async ({ page }) => {
  await page.goto("/fonlar/byf?gorunum=buyukluk");
  await expect(page.locator("thead")).toContainText("Prim/İskonto");
  await expect(page.locator("tbody tr").first()).toContainText("+0.50%");
  await page.goto("/fonlar/yat?gorunum=buyukluk");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("thead")).not.toContainText("Prim/İskonto");
});
