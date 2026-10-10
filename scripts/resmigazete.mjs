// Resmi Gazete günlük fihristi: https://www.resmigazete.gov.tr/eskiler/YYYY/MM/YYYYMMDD.htm (mükerrer sayılar ...M1.htm, M2...).
// Sayfa windows-1254; her karar başlığı karar PDF'ine bağlanır, ör. "193 Sayılı Gelir Vergisi Kanununun Geçici 67 nci Maddesinde
// Yer Alan Tevkifat Oranları Hakkında Karar (Karar Sayısı: 11107)" -> 20260327-5.pdf
const BASE = "https://www.resmigazete.gov.tr/eskiler/";

export const fihristUrl = (/** @type {string} */ ymd, mukerrer = 0) =>
  `${BASE}${ymd.slice(0, 4)}/${ymd.slice(5, 7)}/${ymd.replace(/-/g, "")}${mukerrer ? `M${mukerrer}` : ""}.htm`;

export const decode = (/** @type {ArrayBuffer | Uint8Array} */ buf) => new TextDecoder("windows-1254").decode(buf);

const text = (/** @type {string} */ s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// Fihristteki yatırım fonu stopajını (GVK geçici 67) düzenleyen kararlar: [{ karar, title, url }]
export function parseFihrist(/** @type {string} */ html, /** @type {string} */ pageUrl) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = text(m[2]).replace(/^[–—-]+\s*/, ""); // fihrist maddeleri "––" ile başlar
    if (!/Gelir Vergisi Kanunu/i.test(title) || !/Ge[cç]ici 67/i.test(title)) continue;
    const no = title.match(/Karar Say[ıi]s[ıi]\s*:\s*(\d+)/i);
    if (no) out.push({ karar: no[1], title, url: new URL(m[1], pageUrl).href });
  }
  return out;
}

// Günün fihristi ve mükerrer sayıları (ilk 404'te durur). Yayın olmayan gün: []. Ağ/sunucu hatası: fırlatır (gün taranmış sayılmaz).
export async function fetchDay(/** @type {string} */ ymd) {
  const pages = [];
  for (let m = 0; m <= 3; m++) {
    const url = fihristUrl(ymd, m);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (tefas-fon stopaj bekçisi)" }, signal: AbortSignal.timeout(30000) });
    if (res.status === 404) break;
    if (!res.ok) throw new Error(`Resmi Gazete ${url}: HTTP ${res.status}`);
    pages.push({ url, html: decode(await res.arrayBuffer()) });
    await new Promise((r) => setTimeout(r, 500)); // nazik ol
  }
  return pages;
}
