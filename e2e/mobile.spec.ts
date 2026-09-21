import { expect, test } from "@playwright/test";

// iPhone SE genişliği: en dar yaygın ekran
test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

const noPageScroll = async (page) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "sayfa yatayda taşıyor").toBeLessThanOrEqual(0);
};
const codeAt = async (page, i = 0) => (await page.locator("tbody tr").nth(i).locator("td").nth(1).innerText()).trim();
const list = async (page, path = "/fonlar/yat") => {
  await page.goto(path);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.waitForFunction(() => { const i = document.querySelector("tbody input"); return !!i && Object.keys(i).some((k) => k.startsWith("__react")); });
};

test("viewport meta initial-scale=1 içerir", async ({ page }) => {
  await page.goto("/fonlar/yat");
  await expect(page.locator("meta[name=viewport]")).toHaveAttribute("content", /initial-scale=1/);
});

test("mobil: liste sayfası yatay taşmaz, gezinme ve filtreler ekrana sığar", async ({ page }) => {
  await list(page);
  await noPageScroll(page);
  for (const a of await page.locator("nav a").all()) {
    const b = (await a.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
  }
  const search = (await page.getByPlaceholder("Fon kodu veya adı…").boundingBox())!;
  expect(search.x + search.width).toBeLessThanOrEqual(375);
  expect(search.width).toBeGreaterThan(300); // tam genişlik
});

test("mobil: tablo kendi içinde yatay kaydırılır, sayfa değil", async ({ page }) => {
  await list(page);
  const box = page.locator("[data-slot=table-container]");
  expect(await box.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  await noPageScroll(page);
});

test("mobil: görünüm sekmeleri sığar ve çalışır", async ({ page }) => {
  await list(page);
  const tab = page.getByRole("tab", { name: "Nakit Giriş-Çıkışı" });
  await tab.scrollIntoViewIfNeeded();
  await tab.tap();
  await expect(page.locator("thead")).toContainText("1 Hafta");
  await noPageScroll(page);
});

test("mobil: arama ve Tüm Filtreler çalışır", async ({ page }) => {
  await list(page);
  const code = await codeAt(page);
  await page.getByPlaceholder("Fon kodu veya adı…").fill(code);
  await expect(page.locator("tbody tr").first().locator("td").nth(1)).toHaveText(code);
  await page.getByText("Tüm Filtreler").tap();
  await expect(page.getByText("Fon büyüklüğü (mn ₺)")).toBeVisible();
  await noPageScroll(page);
});

test("mobil: satıra dokununca fon detayına gider; detay sayfası taşmaz", async ({ page }) => {
  await list(page);
  const code = await codeAt(page);
  await page.locator("tbody tr").first().locator("td").nth(2).tap();
  await expect(page).toHaveURL(new RegExp(`/fon/${code}$`));
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  await noPageScroll(page);
  const chart = (await page.locator(".recharts-wrapper").first().boundingBox())!;
  expect(chart.x + chart.width).toBeLessThanOrEqual(375);
});

test("mobil: karşılaştırma formu ve tablosu taşmaz", async ({ page }) => {
  await list(page);
  const [a, b] = [await codeAt(page, 0), await codeAt(page, 1)];
  await page.goto("/karsilastir");
  await noPageScroll(page);
  const input = (await page.getByRole("combobox", { name: "Fon ekle" }).boundingBox())!;
  expect(input.x + input.width).toBeLessThanOrEqual(375);
  for (const c of [a, b]) {
    await page.getByRole("combobox", { name: "Fon ekle" }).fill(c);
    await page.getByRole("option").first().tap();
  }
  await noPageScroll(page);
  await page.getByRole("button", { name: "Karşılaştır" }).tap();
  await expect(page.locator("thead")).toContainText(a);
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  await noPageScroll(page);
});
