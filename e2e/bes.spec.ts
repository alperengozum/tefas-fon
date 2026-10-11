import { expect, test } from "@playwright/test";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

test("BES simülasyonu: DK fonu otomatik seçilir, yıllık DK oranları ve hak ediş", async ({ page }) => {
  const end = new Date(), start = new Date(Date.now() - 365 * 864e5);
  await page.goto(`/bes-simulasyon?fon=EMA&aylik=1000&baslangic=${ymd(start)}&bitis=${ymd(end)}&yas=40`);
  const ozet = page.getByTestId("bes-ozet");
  await expect(ozet).toContainText("EMD (otomatik)"); // aynı şirketin DEVLET KATKISI fonu
  await expect(ozet.locator("div.rounded-lg", { hasText: "Hak ediş" })).toContainText("%0"); // 3 yıldan kısa
  await expect(ozet.locator("div.rounded-lg", { hasText: "Yatırılan katkı" })).toContainText(/1[23] B ₺/);
  const rows = page.getByTestId("bes-yillar").locator("tbody tr");
  const years = await rows.locator("td:first-child").allInnerTexts();
  for (const [i, y] of years.entries()) await expect(rows.nth(i).locator("td").nth(3)).toHaveText(Number(y) >= 2026 ? "%20" : "%30");
  await expect(page.getByTestId("bes-not")).toContainText("1 Ocak 2026");
});

test("BES simülasyonu: fon seçilmeden yönlendirme, bilinmeyen fon; detaydan bağlantı", async ({ page }) => {
  await page.goto("/bes-simulasyon");
  await expect(page.getByText("Bir BES fonu seç")).toBeVisible();
  await page.goto("/bes-simulasyon?fon=ZZZ");
  await expect(page.getByText("Fon bulunamadı: ZZZ")).toBeVisible();
  await page.goto("/fon/EMA");
  await page.getByRole("link", { name: "BES simülasyonu" }).click();
  await expect(page).toHaveURL(/\/bes-simulasyon\?fon=EMA$/);
  await expect(page.getByTestId("bes-ozet")).toBeVisible();
});
