import { expect, test } from "@playwright/test";

const n = (s: string) => Number(s.replace("%", "").replace("+", ""));

test("liste: USD bazında seçimi 1Y getiriyi USD/TRY getirisine göre çevirir, TL'ye geri döner", async ({ page, request }) => {
  const { usd } = await (await request.get("/api/funds/yat")).json();
  expect(typeof usd.y1).toBe("number");
  await page.goto("/fonlar/yat");
  await page.waitForFunction(() => { const i = document.querySelector("tbody input"); return !!i && Object.keys(i).some((k) => k.startsWith("__react")); });
  const head = page.locator("thead th", { hasText: /^1Y/ });
  const idx = await head.evaluate((th) => [...th.parentElement!.children].indexOf(th));
  const cell = () => page.locator("tbody tr").first().locator("td").nth(idx);
  const tl = n(await cell().innerText());
  await page.getByRole("button", { name: "USD bazında" }).click();
  await expect(page.getByTestId("usd-not")).toBeVisible();
  await expect.poll(async () => n(await cell().innerText())).toBeCloseTo(((1 + tl / 100) / (1 + usd.y1 / 100) - 1) * 100, 1);
  await page.getByRole("button", { name: "TL getiri" }).click();
  await expect.poll(async () => n(await cell().innerText())).toBeCloseTo(tl, 2);
  await page.getByRole("tab", { name: "Büyüklük" }).click();
  await expect(page.getByRole("button", { name: "USD bazında" })).toHaveCount(0); // getiri olmayan görünümde seçici yok
});

test("fon detayı: endeks tablosunda USD bazında satırı", async ({ page }) => {
  await page.goto("/fon/BBB");
  const row = page.getByTestId("usd-satir");
  await expect(row.locator("td").first()).toHaveText("BBB USD bazında");
  await expect(row.locator("td").nth(6)).toHaveText(/^[+-]\d+\.\d{2}%$/); // 1Y
});
