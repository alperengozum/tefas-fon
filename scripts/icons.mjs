// PWA ikonlarını public/favicon.svg'den üretir: node scripts/icons.mjs (çıktılar repoda, favicon değişince yeniden çalıştır)
// maskable: Android simgeyi daireye/yuvarlak kareye kırpar; logo güvenli alanda (%80) kalsın diye kenarlar zemin rengiyle doldurulur.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname;
const BG = "#111111";

for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]])
  await sharp(svg, { density: 1200 }).resize(size, size).flatten({ background: BG }).png().toFile(out(file));

const inner = Math.round(512 * 0.7);
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: await sharp(svg, { density: 1200 }).resize(inner, inner).png().toBuffer(), gravity: "center" }])
  .png().toFile(out("icon-maskable-512.png"));
console.log("ikonlar üretildi");
