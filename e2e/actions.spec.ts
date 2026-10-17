import { expect, test } from "@playwright/test";

test("üst menü 5 giriş; fon detayı ve hesap araçları doğru girişi aktif gösterir", async ({ page }) => {
  await page.goto("/fon/AAA");
  const top = page.locator("#nav-links > a");
  await expect(top).toHaveText(["Fonlar", "Karşılaştır", "Hisse Ara", "Portföyüm", "Simülasyon"]);
  await expect(top.filter({ hasText: "Fonlar" })).toHaveAttribute("aria-current", "page");
  await page.goto("/hedef");
  await expect(top.filter({ hasText: "Simülasyon" })).toHaveAttribute("aria-current", "page");
});

test("liste: fon türü sekmeleri, tarama çipleri ve kurucular bağlantısı", async ({ page }) => {
  await page.goto("/fonlar/yat");
  const tur = page.getByRole("navigation", { name: "Fon türü" });
  await expect(tur.getByRole("link", { name: "Yatırım" })).toHaveAttribute("aria-current", "page");
  await tur.getByRole("link", { name: "Emeklilik (BES)" }).click();
  await expect(page).toHaveURL(/\/fonlar\/bes$/);
  const chips = page.getByTestId("hazir-taramalar");
  await expect(chips.getByRole("link", { name: "Son 1 yılda en çok kazandıran BES fonları" })).toBeVisible();
  await expect(chips.getByRole("link", { name: "Kurucular" })).toHaveAttribute("href", "/kurucu?tur=bes");
  await page.goto("/fonlar/gyf"); // GYF taraması yok: etiket gizli, bağlantılar duruyor
  await expect(chips.getByText("Hazır taramalar:")).toHaveCount(0);
  await expect(chips.getByRole("link", { name: "Tüm taramalar" })).toBeVisible();
});

test("fon detayı aksiyon çubuğu: yatırım fonunda simülasyon, BES fonunda BES simülasyonu", async ({ page }) => {
  await page.goto("/fon/AAA");
  const bar = page.getByTestId("fon-aksiyon");
  await expect(bar.getByRole("link", { name: "Karşılaştırmaya ekle" })).toHaveAttribute("href", "/karsilastir?codes=AAA");
  await expect(bar.getByRole("link", { name: "Portföye ekle" })).toHaveAttribute("href", "/portfoy?ekle=AAA");
  await expect(bar.getByRole("link", { name: "Simüle et" })).toHaveAttribute("href", "/simulasyon?codes=AAA");
  await expect(bar.getByRole("link", { name: "Hedef planla" })).toHaveAttribute("href", "/hedef?fon=AAA");
  await expect(bar.getByRole("button", { name: "Listede pinle" })).toBeVisible();
  await page.mouse.wheel(0, 2000); // kaydırınca üstte kalır
  await expect(bar).toBeInViewport();
  await page.goto("/fon/EMA");
  await expect(bar.getByRole("link", { name: "BES simülasyonu" })).toHaveAttribute("href", "/bes-simulasyon?fon=EMA");
  await expect(bar.getByRole("link", { name: "Simüle et" })).toHaveCount(0);
});

test("portföye ekle: kayıtlı portföye satır eklenir, tutara odaklanır, tekrar eklemez", async ({ page }) => {
  await page.goto("/portfoy?f=BBB:tl:3000");
  const satir = page.getByTestId("portfoy-satir");
  await expect(satir).toHaveCount(1); // form hydrate oldu, portföy localStorage'a yazıldı
  await page.goto("/fon/AAA");
  await page.getByTestId("fon-aksiyon").getByRole("link", { name: "Portföye ekle" }).click();
  await expect(page).toHaveURL(/\/portfoy\?f=BBB%3Atl%3A3000&ekle=AAA$/); // kayıtlı portföy korunur
  await expect(page.getByTestId("portfoy-eklendi")).toContainText("AAA");
  await expect(satir).toHaveCount(2);
  await expect(satir.nth(1).getByLabel("Tutar (₺)")).toBeFocused();
  await page.keyboard.type("2000");
  await page.getByRole("button", { name: "Analiz et" }).click();
  await expect(page).toHaveURL(/f=BBB%3Atl%3A3000&f=AAA%3Atl%3A2000$/);
  await page.goto("/portfoy?ekle=AAA"); // zaten portföyde: yeni satır yok
  await expect(satir).toHaveCount(2);
});

test("hesap araçları ortak sekmeler; seçili fon simülasyon ve hedef arasında taşınır", async ({ page }) => {
  await page.goto("/hedef?fon=AAA");
  const tabs = page.getByRole("navigation", { name: "Hesap aracı" });
  await expect(tabs.getByRole("link", { name: "Hedef planlayıcı" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "Geçmiş simülasyon" })).toHaveAttribute("href", "/simulasyon?codes=AAA");
  await expect(tabs.getByRole("link", { name: "BES simülasyonu" })).toHaveAttribute("href", "/bes-simulasyon");
});

test("analitik: env verilmedikçe Umami script'i yok, gizlilik metni analitik yok der", async ({ page }) => {
  await page.goto("/privacy-policy");
  await expect(page.locator("script[data-website-id]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hesap ve takip yok" })).toBeVisible();
});
