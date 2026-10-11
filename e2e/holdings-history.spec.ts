import { expect, test } from "@playwright/test";

test("fon detayı: önceki rapora göre çıkarılan / artırılan, eşik altı gizli", async ({ page }) => {
  await page.goto("/fon/BBB");
  const box = page.getByTestId("portfoy-degisim");
  await expect(box).toContainText("7. Ay 2026 → 8. Ay 2026");
  await expect(box.locator("div", { hasText: /^Çıkarılan/ })).toContainText("ASELS 5.00%");
  await expect(box.locator("div", { hasText: /^Artırılan/ })).toContainText("EREGL +2.50");
  await expect(box).not.toContainText("THYAO"); // +0,2 puan: fiyat gürültüsü
  await page.goto("/fon/EEE");
  await expect(page.getByTestId("portfoy-degisim").locator("div", { hasText: /^Yeni giren/ })).toContainText("ASELS 2.40%");
  await expect(page.getByTestId("portfoy-degisim").locator("div", { hasText: /^Azaltılan/ })).toContainText("EREGL -1.90");
});

test("hisse sayfası: değişim sütunu, yeni alan ve çıkaran fonlar", async ({ page }) => {
  await page.goto("/hisse/EREGL");
  const row = (code: string) => page.getByTestId("hisse-fonlar").locator("tr", { hasText: code });
  await expect(row("BBB").locator("td").nth(3)).toHaveText("+2.50");
  await expect(row("EEE").locator("td").nth(3)).toHaveText("-1.90");
  await page.goto("/hisse/ASELS");
  await expect(row("EEE").locator("td").nth(3)).toHaveText("yeni");
  await expect(page.getByTestId("hisse-cikaranlar")).toContainText("BBB");
  await expect(page.getByTestId("hisse-cikaranlar")).toContainText("önceki ağırlık 5.00%");
  await expect(page.getByTestId("hisse-degisim-ozet")).toContainText("1 fon yeni aldı, 1 fon çıkardı");
});
