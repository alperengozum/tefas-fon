import { expect, test, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

const read = async (dl: Download) => readFileSync(await dl.path(), "utf8");

test("liste: CSV indir filtrelenmiş tüm satırları açık görünümün sütunlarıyla verir", async ({ page }) => {
  await page.goto("/fonlar/yat");
  await page.waitForFunction(() => { const i = document.querySelector("tbody input"); return !!i && Object.keys(i).some((k) => k.startsWith("__react")); });
  await page.getByPlaceholder("Fon kodu veya adı…").fill("portföy");
  await page.getByRole("tab", { name: "Risk" }).click();
  const total = Number((await page.getByText(/^\d+ fon/).innerText()).match(/^\d+/)![0]);
  const btn = page.getByRole("button", { name: /^CSV indir/ });
  await expect(btn).toHaveText(`CSV indir (${total})`);
  const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
  expect(dl.suggestedFilename()).toMatch(/^fonlar-yat-risk-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await read(dl);
  expect(text.charCodeAt(0)).toBe(0xfeff); // Excel UTF-8
  const lines = text.replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines[0]).toBe("Kod;Fon;Tür;Kurucu;Durum;Fiyat;Büyüklük (₺);Yatırımcı;Risk;Volatilite 1Y;Maks. düşüş 1Y %;Getiri 1Y %");
  expect(lines.length - 1).toBe(total);
  expect(lines[1]).toMatch(/^[A-Z0-9]{3};[^;]+;[^;]+;[^;]+;aktif;\d+(,\d+)?;\d+;\d+;/); // ondalık virgül, işaretsiz sayılar
});

test("liste: USD bazında seçiliyken CSV getiri başlıkları (USD) ve dosya adı -usd", async ({ page }) => {
  await page.goto("/fonlar/yat");
  await page.waitForFunction(() => { const i = document.querySelector("tbody input"); return !!i && Object.keys(i).some((k) => k.startsWith("__react")); });
  await page.getByRole("button", { name: "USD bazında" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^CSV indir/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^fonlar-yat-getiri-usd-\d{4}-\d{2}-\d{2}\.csv$/);
  const head = (await read(dl)).replace(/^﻿/, "").split("\r\n")[0];
  expect(head).toContain(";1Y % (USD);");
  expect(head).toMatch(/;Risk$/); // getiri olmayan sütun işaretlenmez
});

test("portföy: fon tablosu CSV", async ({ page }) => {
  await page.goto("/portfoy?f=AAA:tl:7000&f=BBB:tl:3000");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV indir" }).click()]);
  const lines = (await read(dl)).replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines[0]).toBe("Kod;Fon;Adet;Fiyat;Tutar (₺);Pay %");
  expect(lines.slice(1).map((l) => l.split(";")[0]).sort()).toEqual(["AAA", "BBB"]);
  expect(lines.find((l) => l.startsWith("AAA"))!.split(";").slice(4)).toEqual(["7000", "70"]);
});
