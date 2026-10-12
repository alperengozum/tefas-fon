import { expect, test } from "@playwright/test";

test("kurucular: yatırım fonları tablosu, tür seçimi ve kurucu sayfası", async ({ page, request }) => {
  await page.goto("/kurucu");
  const table = page.getByTestId("kurucu-tablo");
  // seed YAT kurucuları: ALFA (AAA, BBB), BETA (AAB, CCC, DDD), GAMA (EEE)
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText(/PORTFÖY/);
  await page.getByRole("navigation", { name: "Fon türü" }).getByRole("link", { name: "Emeklilik (BES)" }).click();
  await expect(page).toHaveURL(/tur=bes/);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.goto("/kurucu?tur=yat");
  await table.getByRole("link", { name: "BETA PORTFÖY" }).click();
  await expect(page).toHaveURL(/\/kurucu\/beta-portfoy\?tur=yat$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BETA PORTFÖY");
  await expect(page.getByTestId("kurucu-ozet")).toContainText("Aktif fon3");
  const codes = (await page.getByTestId("kurucu-fonlar").locator("tbody tr td:first-child b").allInnerTexts()).sort();
  expect(codes).toEqual(["AAB", "CCC", "DDD"]);
  expect((await request.get("/kurucu/yok-boyle")).status()).toBe(404);
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/kurucu/beta-portfoy<");
});

test("fon detayından kurucu sayfasına bağlantı", async ({ page }) => {
  await page.goto("/fon/BBB");
  await page.getByTestId("kurucu-link").click();
  await expect(page).toHaveURL(/\/kurucu\/alfa-portfoy\?tur=yat$/);
  await expect(page.getByTestId("kurucu-fonlar")).toContainText("BBB");
});
