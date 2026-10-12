import { expect, test } from "@playwright/test";

const money = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", ".")) * (/mr/.test(s) ? 1e9 : /mn/.test(s) ? 1e6 : / B/.test(s) ? 1e3 : 1);

test("hedef planlayıcı: olasılık, yüzdelikler sıralı, yıllık tablo; aynı girdi aynı sonuç", async ({ page }) => {
  const url = "/hedef?fon=BBB&baslangic=10000&aylik=2000&yil=5&hedef=200000";
  await page.goto(url);
  const ozet = page.getByTestId("hedef-ozet");
  await expect(ozet).toContainText("Hedefe ulaşma olasılığı");
  const card = (k: string) => ozet.locator("div.rounded-lg", { hasText: k }).locator("div.text-lg");
  const [p10, p50, p90] = [await card("Kötü senaryo").innerText(), await card("Medyan son değer").innerText(), await card("İyi senaryo").innerText()].map(money);
  expect(p10).toBeLessThanOrEqual(p50);
  expect(p50).toBeLessThanOrEqual(p90);
  expect(money(await card("Hedef için aylık (%50)").innerText())).toBeLessThanOrEqual(money(await card("Hedef için aylık (%80)").innerText()));
  await expect(page.getByTestId("hedef-yillar").locator("tbody tr")).toHaveCount(5);
  await expect(page.getByTestId("hedef-varsayim")).toContainText("nominal TL");
  const before = await ozet.innerText();
  await page.reload();
  expect(await ozet.innerText()).toBe(before); // tohumlu senaryolar
});

test("hedef planlayıcı: enflasyonla bugünün parası; uzun sürede tablo 5 yılda bir; boş/bilinmeyen fon", async ({ page }) => {
  await page.goto("/hedef?fon=BBB&aylik=1000&yil=20&enflasyon=30");
  await expect(page.getByTestId("hedef-varsayim")).toContainText("bugünün parasıyla");
  await expect(page.getByTestId("hedef-ozet")).not.toContainText("Hedefe ulaşma olasılığı"); // hedef girilmedi
  expect(await page.getByTestId("hedef-yillar").locator("tbody td:first-child").allInnerTexts()).toEqual(["5", "10", "15", "20"]);
  await page.goto("/hedef");
  await expect(page.getByText("Bir fon seç")).toBeVisible();
  await page.goto("/hedef?fon=ZZZ");
  await expect(page.getByText("Fon bulunamadı: ZZZ")).toBeVisible();
});
