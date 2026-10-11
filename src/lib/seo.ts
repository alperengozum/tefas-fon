// SEO yardımcıları (saf): mutlak URL, sitemap XML, robots.txt, llms.txt, JSON-LD, fon OG görseli (SVG).
export const SITE_NAME = "TEFAS Fon Analiz";
export const SITE_DESC = "Türkiye'deki yatırım, emeklilik (BES), BYF ve GYF fonlarını listeleme, getiri/risk analizi ve karşılaştırma aracı. Veriler TEFAS ve KAP'tan, ücretsiz.";
// Prod adresi: astro.config `site` (SITE_URL ortam değişkeni, yoksa canlı demo)
export const DEFAULT_SITE = "https://fon.yourapiservice.com";

export const abs = (site: string | URL | undefined, path: string) => new URL(path, site ?? DEFAULT_SITE).href;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export type SitemapEntry = { loc: string; lastmod?: string | null; priority?: number };
export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((e) =>
    `<url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : ""}${e.priority != null ? `<priority>${e.priority.toFixed(1)}</priority>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// Kamuya açık veri: arama motorları ve AI tarayıcıları (alıntı/yanıt) serbest. Sorgu parametreli araç sayfaları
// (karşılaştır/portföy/simülasyon) sonsuz URL üretir, taranmaz; API agent'lar için açık (llms.txt).
const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider"];
const NO_QUERY = ["/karsilastir?", "/portfoy?", "/simulasyon?"];
export function robotsTxt(site: string | URL | undefined): string {
  const block = (ua: string) => [`User-agent: ${ua}`, "Allow: /", ...NO_QUERY.map((p) => `Disallow: ${p}`)].join("\n");
  return [block("*"), ...AI_BOTS.map(block), `Sitemap: ${abs(site, "/sitemap.xml")}`].join("\n\n") + "\n";
}

// llms.txt (llmstxt.org): agent'ların siteyi okuyup araçlarını çağırabilmesi için özet. Sözleşmeler sayfa/API koduyla aynı.
export function llmsTxt(site: string | URL | undefined, scans: { slug: string; title: string; description: string }[] = []): string {
  const origin = abs(site, "/").replace(/\/$/, "");
  const u = (p: string) => origin + p; // URL() kullanılmaz: {KOD} gibi yer tutucuları %7B..%7D'ye çevirir
  return `# ${SITE_NAME}

> ${SITE_DESC}

Kimlik doğrulama yok, düz HTTP GET. Veri günde bir (10:00 ve 12:00) TEFAS'tan güncellenir; hisse portföyleri KAP Portföy Dağılım Raporlarından, endeksler Yahoo Finance'ten. IP başına 10 saniyede 50 istek sınırı vardır (aşılınca 429 + Retry-After). Yatırım tavsiyesi değildir.

## Sayfalar

- [Yatırım fonları](${u("/fonlar/yat")}): tüm yatırım fonları; getiri (1G-5Y), büyüklük, nakit akışı, risk. Diğer türler: ${u("/fonlar/bes")} (BES), ${u("/fonlar/byf")}, ${u("/fonlar/gyf")}. \`?hisse=EREGL\` ile o hisseyi tutan fonlar
- [Fon detayı](${u("/fon/AFT")}): \`GET ${u("/fon/{KOD}")}\`: fiyat geçmişi, getiriler, endekslere karşı, varlık dağılımı, hisse portföyü, rakipler, KAP bildirimleri (KOD büyük/küçük harf fark etmez; bilinmeyen kod 404)
- [Hisseyi tutan fonlar](${u("/hisse")}): \`GET ${u("/hisse/{HISSE}")}\`: hisseyi tutan fonlar, ağırlık ve tahmini TL pozisyon
- [Karşılaştırma](${u("/karsilastir")}): \`GET ${u("/karsilastir?codes=KOD1,KOD2&endeks=1")}\`: en fazla 10 fon, 100'e endeksli grafik, korelasyon ve hisse örtüşmesi; \`endeks=1\` endeksleri ekler
- [Portföy](${u("/portfoy")}): \`GET ${u("/portfoy?f=KOD:tl:5000&f=KOD:adet:120")}\`: tutar (tl) ya da pay adedi (adet); birleşik varlık dağılımı, hisse maruziyeti, geçmiş performans (en fazla 15 satır)
- [Simülasyon](${u("/simulasyon")}): \`GET ${u("/simulasyon?codes=KOD1,KOD2&monthly=5000&start=YYYY-MM-DD&end=YYYY-MM-DD")}\`: aylık düzenli alım (XIRR) ve tek seferlik alım, endekslerle kıyaslı (en fazla 6 fon)
${scans.length ? `\n## Hazır taramalar\n\n${scans.map((s) => `- [${s.title}](${u(`/tarama/${s.slug}`)}): ${s.description}`).join("\n")}\n` : ""}
## API (JSON, sürümlü: /api/v1)

Agent'lar için önerilen uçlar. Alan adları İngilizce ve sabit; CORS açık; IP başına dakikada 60 istek. Belge: ${u("/api")}, OpenAPI: ${u("/api/v1/openapi.json")}

- \`GET ${u("/api/v1/funds?kind={yat|bes|byf|gyf|all}&q=&type=&founder=&sort=y1&order=desc&limit=20&offset=0")}\`: fon arama/sıralama
- \`GET ${u("/api/v1/funds/{KOD}?history=365")}\`: fon detayı (getiriler, endeks kıyası, risk, varlık dağılımı, hisse portföyü, isteğe bağlı fiyat geçmişi)
- \`GET ${u("/api/v1/stocks/{HISSE}?min_weight=1")}\`: hisseyi tutan fonlar
- \`GET ${u("/api/v1/compare?codes=KOD1,KOD2")}\`: 2-10 fon getirileri ve korelasyon
- \`GET ${u("/api/v1/scans/{slug}")}\`: hazır tarama sonucu

## MCP

- \`${u("/mcp")}\`: MCP sunucusu (Streamable HTTP, durumsuz, POST). Araçlar: search_funds, get_fund, funds_holding_stock, compare_funds, run_scan

## Sitenin iç uçları

- \`GET ${u("/api/holdings?ticker=EREGL&min=1")}\`: hisseyi en az \`min\` % ağırlıkla tutan fonlar, \`{"FONKODU": ağırlık}\`. Ticker 2+ karakter, değilse \`{}\`
- \`GET ${u("/api/funds/{yat|bes|byf|gyf|all}")}\`: fon listesi, sıkıştırılmış biçim \`{types, founders, assets, rows}\` (satırlar konumsal dizi; biçim sitenin kendi istemcisi içindir ve değişebilir, insan-okur içerik için /fon/{KOD} tercih edin)

## Notlar

- Kanonik dil Türkçe, tek dil. Fon kodları TEFAS kodlarıdır (3 harf)
- Getiriler % ve fiyat açıklanmamış günlerde (0) boş; pasif (tasfiye/birleşme) fonlarda getiri gösterilmez
- Kaynak kod: https://github.com/alperengozum/tefas-fon (PolyForm Noncommercial)
`;
}

export type Crumb = { name: string; path: string };
// Tek @graph: WebSite + WebPage (+ gerçek gezinme hiyerarşisi varsa BreadcrumbList). Puan/fiyat gibi uydurma alan yok.
export function jsonLd(site: string | URL | undefined, page: { path: string; title: string; description: string }, crumbs: Crumb[] = []) {
  const origin = abs(site, "/"), url = abs(site, page.path);
  const graph: Record<string, unknown>[] = [
    { "@type": "WebSite", "@id": `${origin}#website`, name: SITE_NAME, url: origin, description: SITE_DESC, inLanguage: "tr-TR" },
    { "@type": "WebPage", "@id": `${url}#webpage`, url, name: page.title, description: page.description, inLanguage: "tr-TR", isPartOf: { "@id": `${origin}#website` } },
  ];
  if (crumbs.length) graph.push({
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(site, c.path) })),
  });
  // </script> kaçışı: içerik (fon adı) script bloğunu kapatamasın
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

// Fon OG görseli (1200x630 SVG, sharp ile PNG'ye çevrilir). Marka: favicon'daki koyu zemin + zümrüt çizgi, nötr shadcn paleti.
// Yazı tipi DejaVu Sans: Docker imajına kurulu (font-dejavu), librsvg web fontu yükleyemiyor.
export type OgFund = { code: string; name: string; kind: string; ret1y: number | null; ret1m: number | null; size: number | null; prices: number[]; date: string };
const sign = (v: number | null) => (v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);
const col = (v: number | null) => (v == null ? "#a3a3a3" : v >= 0 ? "#34d399" : "#f87171");
export function fundOgSvg(f: OgFund): string {
  const p = f.prices.filter((x) => x > 0);
  let spark = "";
  if (p.length > 1) {
    const lo = Math.min(...p), hi = Math.max(...p), W = 1040, H = 150, x0 = 80, y0 = 430;
    const pts = p.map((v, i) => `${(x0 + (i / (p.length - 1)) * W).toFixed(1)},${(y0 + H - (hi > lo ? ((v - lo) / (hi - lo)) * H : H / 2)).toFixed(1)}`);
    spark = `<polyline points="${pts.join(" ")}" fill="none" stroke="${col(p[p.length - 1] - p[0])}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const name = f.name.length > 58 ? f.name.slice(0, 56).trimEnd() + "…" : f.name;
  const size = f.size == null ? "–" : f.size >= 1e9 ? `${(f.size / 1e9).toFixed(1).replace(".", ",")} mr ₺` : `${(f.size / 1e6).toFixed(0)} mn ₺`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="DejaVu Sans, sans-serif">
<rect width="1200" height="630" fill="#111111"/>
<g transform="translate(80,64) scale(1.5)"><rect width="32" height="32" rx="6" fill="#262626"/><path d="M6 22l7-8 5 4 8-10" fill="none" stroke="#34d399" stroke-width="3"/></g>
<text x="142" y="98" font-size="30" fill="#e5e5e5" font-weight="bold">${esc(SITE_NAME)}</text>
<text x="1120" y="98" font-size="26" fill="#a3a3a3" text-anchor="end">${esc(f.kind)} · ${esc(f.date.split("-").reverse().join("."))}</text>
<text x="80" y="210" font-size="96" fill="#fafafa" font-weight="bold">${esc(f.code)}</text>
<text x="80" y="262" font-size="30" fill="#d4d4d4">${esc(name)}</text>
<text x="80" y="322" font-size="24" fill="#a3a3a3">1 yıl getiri</text><text x="80" y="372" font-size="44" fill="${col(f.ret1y)}" font-weight="bold">${sign(f.ret1y)}</text>
<text x="440" y="322" font-size="24" fill="#a3a3a3">1 ay getiri</text><text x="440" y="372" font-size="44" fill="${col(f.ret1m)}" font-weight="bold">${sign(f.ret1m)}</text>
<text x="800" y="322" font-size="24" fill="#a3a3a3">Büyüklük</text><text x="800" y="372" font-size="44" fill="#fafafa" font-weight="bold">${esc(size)}</text>
${spark}
</svg>`;
}
