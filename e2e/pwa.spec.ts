import { expect, test } from "@playwright/test";

test("manifest, ikonlar ve service worker sunuluyor", async ({ page, request }) => {
  await page.goto("/fonlar/yat");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await request.get(href!);
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.start_url).toBe("/fonlar/yat");
  expect(m.display).toBe("standalone");
  for (const i of m.icons) expect((await request.get(i.src)).ok(), i.src).toBeTruthy();
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBeTruthy();
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect((await request.get("/offline")).ok()).toBeTruthy();
});

test("service worker kaydolur ve sayfayı kontrol eder", async ({ page }) => {
  await page.goto("/fonlar/yat");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");
});

test("çevrimdışı: daha önce açılan sayfa önbellekten, açılmayan /offline'dan gelir", async ({ page, context }) => {
  await page.goto("/fon/BBB");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // ilk yüklemede SW henüz kontrol etmiyordu: bu yükleme önbelleğe yazar
  await expect(page.locator("h1")).toContainText("BBB");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toContainText("BBB");
  await page.goto("/fon/CCC");
  await expect(page.locator("h1")).toHaveText("Çevrimdışısın");
  await context.setOffline(false);
});

test("tema düğmesi sistem -> açık -> koyu döner ve hatırlanır", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/fonlar/yat");
  const html = page.locator("html"), btn = page.locator("#theme-toggle");
  await expect(btn).toHaveAttribute("data-tema", "sistem");
  await expect(html).not.toHaveClass(/dark/);
  await btn.click();
  await expect(btn).toHaveAttribute("data-tema", "acik");
  await expect(html).not.toHaveClass(/dark/);
  await btn.click();
  await expect(btn).toHaveAttribute("data-tema", "koyu");
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await expect(btn).toHaveAttribute("data-tema", "koyu");
  await btn.click();
  await expect(btn).toHaveAttribute("data-tema", "sistem");
  await expect(html).not.toHaveClass(/dark/);
});

test("sistem teması koyuysa sayfa koyu açılır, açık seçimi bunu ezer", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/fonlar/yat");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
  await page.locator("#theme-toggle").click(); // sistem -> açık
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("yazdırırken koyu tema kapanır", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/fon/BBB");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect(page.locator("html")).toHaveClass(/dark/);
});
