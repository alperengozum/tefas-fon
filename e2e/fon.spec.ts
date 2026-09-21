import { expect, test } from "@playwright/test";

const rows = (page) => page.locator("tbody tr");
// tablo 100 satırla sınırlı; gerçek eşleşme sayısı altbilgideki "N fon" yazısında
const total = async (page) => Number((await page.getByText(/^\d+ fon/).innerText()).match(/^\d+/)![0]);
const codeAt = async (page, i = 0) => (await rows(page).nth(i).locator("td").nth(1).innerText()).trim();
// React hydrate olmadan filtre/tıklama çalışmaz; satırdaki checkbox'ta react props varsa hazır
const ready = async (page, path = "/fonlar/yat") => {
  await page.goto(path);
  await expect(rows(page).first()).toBeVisible();
  // ?hisse= ile hydrate sonrası liste kısa süre boşalabilir, o yüzden null korumalı
  await page.waitForFunction(() => { const i = document.querySelector("tbody input"); return !!i && Object.keys(i).some((k) => k.startsWith("__react")); });
};

test("/ -> /fonlar/yat yönlendirir", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/fonlar\/yat$/);
  await expect(page.getByRole("heading", { name: "Yatırım Fonları" })).toBeVisible();
});

test("bilinmeyen tür ve bilinmeyen fon 404", async ({ request }) => {
  expect((await request.get("/fonlar/xyz")).status()).toBe(404);
  expect((await request.get("/fon/ZZZZZZ")).status()).toBe(404);
});

test("gezinme sekmeleri her fon türünü listeler", async ({ page }) => {
  for (const [href, title] of [["bes", "Emeklilik Fonları"], ["byf", "Borsa Yatırım"], ["gyf", "Gayrimenkul"]]) {
    await page.goto("/");
    await page.locator(`nav a[href="/fonlar/${href}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(rows(page).first()).toBeVisible();
  }
});

test("arama kutusu satırları filtreler, Temizle geri alır", async ({ page }) => {
  await ready(page);
  const code = await codeAt(page);
  await page.getByPlaceholder("Fon kodu veya adı…").fill(code);
  await expect(rows(page).first().locator("td").nth(1)).toHaveText(code);
  const filtered = await total(page);
  await page.getByRole("button", { name: "Temizle" }).click();
  await expect.poll(() => total(page)).toBeGreaterThan(filtered);
});

test("olmayan arama boş liste verir", async ({ page }) => {
  await ready(page);
  await page.getByPlaceholder("Fon kodu veya adı…").fill("qqqqqqqq");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText(/^0 fon/)).toBeVisible();
});

test("sütun başlığı sıralar (Kod ↓/↑)", async ({ page }) => {
  await ready(page);
  const head = page.locator("thead th", { hasText: "Kod" });
  const codes = () => rows(page).locator("td:nth-child(2)").allInnerTexts();
  await head.click(); // ilk tık: azalan
  await expect(head).toContainText("↓");
  const desc = await codes();
  expect(desc).toEqual([...desc].sort().reverse());
  await head.click();
  await expect(head).toContainText("↑");
  const asc = await codes();
  expect(asc).toEqual([...asc].sort());
});

test("görünüm sekmeleri sütunları değiştirir", async ({ page }) => {
  await ready(page);
  await expect(page.locator("thead")).toContainText("1Y");
  await page.getByRole("tab", { name: "Büyüklük" }).click();
  await expect(page.locator("thead")).toContainText("Yatırımcı");
  await page.getByRole("tab", { name: "Nakit Giriş-Çıkışı" }).click();
  await expect(page.locator("thead")).toContainText("1 Hafta");
  await expect(page.getByText("Fon türü bazında 1 aylık net giriş:")).toBeVisible();
});

test("hızlı filtre butonu aç/kapa", async ({ page }) => {
  await ready(page);
  const btn = page.getByRole("button", { name: "Döviz cinsi" });
  const all = await total(page);
  await btn.click();
  await expect(page.getByRole("button", { name: "Temizle" })).toBeVisible();
  await expect.poll(() => total(page)).toBeLessThan(all);
  await btn.click();
  await expect(page.getByRole("button", { name: "Temizle" })).toHaveCount(0);
});

test("risk aralığı: min 2 > maks 1 boş liste verir", async ({ page }) => {
  await ready(page);
  await page.getByText("Tüm Filtreler").click();
  const pick = async (idx: number, value: string) => { // 0: baskın varlık, 1: risk min, 2: risk maks
    const trigger = page.locator("details [data-slot=select-trigger]").nth(idx);
    await trigger.click();
    await page.getByRole("option", { name: value, exact: true }).click();
    await expect(trigger).toContainText(value);
    await expect(page.getByRole("option")).toHaveCount(0); // açılır liste tamamen kapanmadan sonrakine geçme
  };
  await pick(1, "2");
  await pick(2, "1");
  await expect(rows(page)).toHaveCount(0);
});

test("fon türü seçici listeyi daraltır", async ({ page }) => {
  await ready(page);
  const all = await total(page);
  await page.locator("[data-slot=select-trigger]", { hasText: "Tüm fon türleri" }).click();
  const opt = page.getByRole("option").nth(1);
  const name = (await opt.innerText()).trim();
  await opt.click();
  await expect.poll(() => total(page)).toBeLessThan(all);
  await expect(rows(page).first().locator("td").nth(2)).toContainText(name);
});

test("hisse filtresi /api/holdings ile fonları daraltır ve % sütunu ekler", async ({ page, request }) => {
  const codes = Object.keys(await (await request.get("/api/holdings?ticker=EREGL&min=1")).json());
  test.skip(codes.length === 0, "DB'de EREGL portföy verisi yok");
  await ready(page, "/fonlar/yat?hisse=EREGL");
  await expect(page.locator("thead")).toContainText("EREGL %");
  await expect.poll(() => rows(page).count()).toBeLessThanOrEqual(codes.length);
  expect(codes).toContain(await codeAt(page));
  await expect(rows(page).first()).toContainText("%");
});

test("satıra tıklayınca fon detayına gider", async ({ page }) => {
  await ready(page);
  const code = await codeAt(page);
  await rows(page).first().locator("td").nth(2).click();
  await expect(page).toHaveURL(new RegExp(`/fon/${code}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
});

test("fon detay: metrikler, grafik, varlık dağılımı, rakipler", async ({ page }) => {
  await ready(page);
  const code = await codeAt(page);
  await page.goto(`/fon/${code.toLowerCase()}`); // küçük harf de çalışmalı
  for (const t of ["Fiyat", "Büyüklük", "Yatırımcı", "Pay sayısı", "Net nakit akışı 1H"]) await expect(page.getByText(t).first()).toBeVisible();
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Varlık dağılımı/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Rakip fonlar/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Karşılaştırmaya ekle" })).toHaveAttribute("href", `/karsilastir?codes=${code}`);
});

test("fon detay: rakip karşılaştırma grafiği, legend'da geniş isim (title)", async ({ page }) => {
  await ready(page);
  await page.goto(`/fon/${await codeAt(page)}`);
  await expect(page.getByRole("heading", { name: /İlk 4 rakiple karşılaştırma/ })).toBeVisible();
  const legend = page.locator(".recharts-legend-item-text span[title]");
  await expect(legend.first()).toBeVisible();
  expect(((await legend.first().getAttribute("title")) ?? "").length).toBeGreaterThan(3);
  expect(await legend.count()).toBeGreaterThanOrEqual(2);
});

test("listede fon seç -> Karşılaştır -> karşılaştırma sayfası", async ({ page }) => {
  await ready(page);
  const [a, b] = [await codeAt(page, 0), await codeAt(page, 1)];
  await rows(page).nth(0).locator("input").check();
  await rows(page).nth(1).locator("input").check();
  await page.getByRole("button", { name: "Karşılaştır (2)" }).click();
  await expect(page).toHaveURL(new RegExp(`/karsilastir\\?codes=${a},${b}$`));
  await expect(page.locator("thead")).toContainText(a);
  await expect(page.locator("thead")).toContainText(b);
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  await expect(page.getByText("Varlık dağılımı").first()).toBeVisible();
});

test("karşılaştırma: boş durum ve form ile kod girişi", async ({ page }) => {
  await ready(page);
  const code = await codeAt(page);
  await page.goto("/karsilastir");
  await expect(page.getByText("Fon listesinden kutucukları işaretleyin")).toBeVisible();
  await page.getByPlaceholder(/Fon kodları/).fill(code.toLowerCase());
  await page.getByRole("button", { name: "Karşılaştır" }).click();
  await expect(page.locator("thead")).toContainText(code);
});

test("/api/holdings: geçersiz ticker {} döner, JSON + cache header", async ({ request }) => {
  const r = await request.get("/api/holdings?ticker=A");
  expect(await r.json()).toEqual({});
  expect(r.headers()["content-type"]).toContain("application/json");
  expect(r.headers()["cache-control"]).toContain("max-age");
  expect(await (await request.get("/api/holdings?ticker=%27%3B--")).json()).toEqual({});
});

test("sonsuz kaydırma: alta inince satırlar 100'den artar", async ({ page }) => {
  await ready(page);
  test.skip((await total(page)) <= 100, "100'den az fon var");
  await expect(rows(page)).toHaveCount(100);
  await page.getByText(/kaydırdıkça yüklenir/).scrollIntoViewIfNeeded();
  await expect.poll(() => rows(page).count()).toBeGreaterThan(100);
  await page.mouse.wheel(0, 100000);
  await expect.poll(() => rows(page).count()).toBeGreaterThan(200);
});

// --- endeks, korelasyon/örtüşme, hisse sayfası, portföy, simülasyon ---
// DB'de birden çok fonun tuttuğu bir hisse (EREGL) kullanılır; yoksa atlanır
const holders = async (request) => Object.keys(await (await request.get("/api/holdings?ticker=EREGL")).json());

test("fon detay: endekslere karşı tablo ve grafik", async ({ page }) => {
  await ready(page);
  await page.goto(`/fon/${await codeAt(page)}`);
  await expect(page.getByRole("heading", { name: /Endekslere karşı/ })).toBeVisible();
  for (const t of ["BIST 100", "USD/TRY", "Gram altın"]) await expect(page.getByRole("cell", { name: t })).toBeVisible();
});

test("hisse sayfası: hisseyi tutan fonlar; bilinmeyen hisse 404", async ({ page, request }) => {
  const codes = await holders(request);
  test.skip(codes.length < 2, "DB'de EREGL portföy verisi yok");
  await page.goto("/hisse/EREGL");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("EREGL");
  await expect(page.locator(`a[href="/fon/${codes[0]}"]`)).toBeVisible();
  expect((await request.get("/hisse/ZZZZ9")).status()).toBe(404);
});

test("karşılaştır: korelasyon + hisse örtüşmesi matrisi, endeks çizgileri", async ({ page, request }) => {
  const codes = await holders(request);
  test.skip(codes.length < 2, "DB'de EREGL portföy verisi yok");
  await page.goto(`/karsilastir?codes=${codes[0]},${codes[1]}&endeks=1`);
  await expect(page.getByRole("heading", { name: /Getiri korelasyonu/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Hisse örtüşmesi/ })).toBeVisible();
  await expect(page.locator(".recharts-legend-item-text", { hasText: "BIST100" })).toBeVisible();
});

test("simülasyon: fon ve endeksler için SIP/tek seferlik sonuç", async ({ page, request }) => {
  const codes = await holders(request);
  test.skip(codes.length < 1, "DB'de EREGL portföy verisi yok");
  await page.goto(`/simulasyon?codes=${codes[0]}&monthly=1000`);
  await expect(page.locator("tbody tr").first()).toContainText(codes[0]);
  await expect(page.locator("tbody tr", { hasText: "BIST 100" })).toContainText("%");
});

test("portföy: birleşik analiz, tarayıcıda hatırlanır", async ({ page, request }) => {
  const codes = await holders(request);
  test.skip(codes.length < 2, "DB'de EREGL portföy verisi yok");
  await page.goto(`/portfoy?p=${codes[0]}:1000,${codes[1]}:2000`);
  await expect(page.getByRole("heading", { name: "Birleşik varlık dağılımı" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Getiri korelasyonu/ })).toBeVisible();
  await page.goto("/portfoy"); // p yok -> localStorage'dan geri yüklenir
  await expect(page).toHaveURL(new RegExp(`p=${codes[0]}`));
});

test("favoriler: listede yıldızla ekle, /favoriler'de görün, detayda çıkar", async ({ page }) => {
  await ready(page);
  const code = await codeAt(page);
  await rows(page).first().getByRole("button", { name: "Favorilere ekle" }).click();
  await page.goto("/favoriler");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator("td").nth(1)).toHaveText(code);
  await page.goto(`/fon/${code}`);
  await page.getByRole("button", { name: "Favorilerden çıkar" }).click();
  await page.goto("/favoriler");
  await expect(page.getByText("Henüz favori fon yok")).toBeVisible();
});
