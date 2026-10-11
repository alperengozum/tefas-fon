import { expect, test } from "@playwright/test";

// Hisse sepeti vs fon (seed: BBB iki KAP raporu, EREGL/THYAO/ASELS stock_px)
test("fon detay: hisse sepeti tablosu iki dönem, katkı listesi ve açıklama", async ({ page }) => {
  await page.goto("/fon/BBB");
  const s = page.getByTestId("sepet");
  await expect(s).toBeVisible();
  const rows = s.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("8. Ay 2026 → bugün");
  await expect(rows.nth(1)).toContainText("7. Ay 2026 → 8. Ay 2026");
  await expect(rows.nth(0)).toContainText("puan");
  await expect(s).toContainText("En çok katkı");
  await expect(s.getByRole("link", { name: /THYAO/ })).toHaveAttribute("href", "/hisse/THYAO");
  await expect(s).toContainText("BIST 100 fiyat endeksidir");
});

test("hisse portföyü olmayan fonda sepet tablosu yok", async ({ page }) => {
  await page.goto("/fon/AAA");
  await expect(page.locator("h1")).toContainText("AAA");
  await expect(page.getByTestId("sepet")).toHaveCount(0);
});
