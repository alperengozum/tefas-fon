import { expect, test } from "@playwright/test";

const rows = (page) => page.locator("tbody tr");
const ready = async (page, path) => {
  await page.goto(path);
  await expect(rows(page).first()).toBeVisible();
  await page.waitForFunction(() => { const i = document.querySelector("tbody input"); return !!i && Object.keys(i).some((k) => k.startsWith("__react")); });
};

test("filtre, görünüm ve sıralama adrese yazılır; yenilemede geri gelir", async ({ page }) => {
  await ready(page, "/fonlar/yat");
  await page.getByPlaceholder("Fon kodu veya adı…").fill("portföy");
  await page.getByRole("tab", { name: "Risk" }).click();
  await page.locator("thead th", { hasText: "Kod" }).click(); // Kod azalan
  await expect(page).toHaveURL(/q=portf%C3%B6y/);
  await expect(page).toHaveURL(/gorunum=risk/);
  await expect(page).toHaveURL(/sirala=code(&|$)/);
  const codes = await rows(page).locator("td:nth-child(2)").allInnerTexts();
  await page.reload();
  await expect(rows(page).first()).toBeVisible();
  await expect(page.getByPlaceholder("Fon kodu veya adı…")).toHaveValue("portföy");
  await expect(page.getByRole("tab", { name: "Risk" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("thead th", { hasText: "Kod" })).toContainText("↓");
  expect(await rows(page).locator("td:nth-child(2)").allInnerTexts()).toEqual(codes);
});

test("hazır adresle açılış: tür ve varlık kuralı uygulanır, Temizle adresi sıfırlar", async ({ page }) => {
  await ready(page, "/fonlar/yat?tur=Hisse+Senedi&varlik=has:g:hisse:50");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator("td").nth(1)).toHaveText("BBB");
  await expect(page.locator("thead")).toContainText("%"); // içersin kuralı sütun ekler
  await page.getByRole("button", { name: "Temizle" }).click();
  await expect(page).toHaveURL(/\/fonlar\/yat$/);
  await expect.poll(() => rows(page).count()).toBeGreaterThan(1);
});

test("Linki kopyala: panoya mevcut adres", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page, "/fonlar/yat?gorunum=nakit");
  await page.getByRole("button", { name: "Linki kopyala" }).click();
  await expect(page.getByRole("button", { name: "Kopyalandı" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/fonlar\/yat\?gorunum=nakit$/);
});
