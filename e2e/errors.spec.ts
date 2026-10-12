import { expect, test } from "@playwright/test";

// Özel 404 sayfası: bilinmeyen yol ve bulunamayan fon/kurucu/tarama/hisse aynı sayfayı 404 koduyla çizer; API/OG düz 404 kalır
test("bilinmeyen adresler marka 404 sayfasını 404 koduyla gösterir, noindex", async ({ page }) => {
  for (const url of ["/olmayan-sayfa", "/fon/ZZZZZZ", "/kurucu/yok-boyle", "/tarama/yok-boyle-tarama", "/hisse/ZZZZ9", "/fonlar/xyz"]) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(404);
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  await expect(page.getByRole("main").getByRole("link", { name: "Yatırım fonları" })).toHaveAttribute("href", "/fonlar/yat");
});

test("404 sayfasındaki fon kodu kutusu fon detayına götürür", async ({ page }) => {
  await page.goto("/fon/ZZZZZZ");
  await page.getByLabel("Fon kodu").fill("aaa");
  await page.getByRole("button", { name: "Git" }).click();
  await expect(page).toHaveURL(/\/fon\/AAA$/);
});

test("API ve OG uçları HTML 404 sayfası döndürmez", async ({ request }) => {
  for (const url of ["/api/funds/xyz", "/og/fon/ZZZZZZ.png"]) {
    const res = await request.get(url);
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain("Sayfa bulunamadı");
  }
});
