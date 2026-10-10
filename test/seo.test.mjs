// SEO yardımcıları ve hazır taramalar
import { test } from "node:test";
import assert from "node:assert/strict";
import { abs, fundOgSvg, jsonLd, llmsTxt, robotsTxt, sitemapXml } from "../src/lib/seo.ts";
import { runScan, SCANS } from "../src/lib/scans.ts";

const SITE = "https://ornek.com";

test("abs: site köküne göre mutlak URL, site yoksa varsayılan", () => {
  assert.equal(abs(SITE, "/fon/AAA"), "https://ornek.com/fon/AAA");
  assert.equal(abs(new URL(SITE), "/"), "https://ornek.com/");
  assert.match(abs(undefined, "/x"), /^https:\/\/fon\.yourapiservice\.com\/x$/);
});

test("sitemapXml: geçerli urlset, XML kaçışı, tarih kırpma", () => {
  const x = sitemapXml([{ loc: "https://ornek.com/hisse/A&B", lastmod: "2026-10-10T12:00:00Z", priority: 0.7 }, { loc: "https://ornek.com/" }]);
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(x.includes("<loc>https://ornek.com/hisse/A&amp;B</loc><lastmod>2026-10-10</lastmod><priority>0.7</priority>"));
  assert.ok(x.includes("<url><loc>https://ornek.com/</loc></url>"));
  assert.equal((x.match(/<url>/g) ?? []).length, 2);
});

test("robotsTxt: herkese ve AI tarayıcılarına açık, araç sorguları kapalı, mutlak sitemap", () => {
  const r = robotsTxt(SITE);
  for (const bot of ["*", "GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) assert.ok(r.includes(`User-agent: ${bot}\nAllow: /`), bot);
  assert.ok(r.includes("Disallow: /portfoy?"));
  assert.ok(!/Disallow: \/fon\b/.test(r)); // fon sayfaları açık
  assert.ok(r.trimEnd().endsWith("Sitemap: https://ornek.com/sitemap.xml"));
});

test("llmsTxt: başlık, özet, mutlak sayfa/API sözleşmeleri ve taramalar", () => {
  const t = llmsTxt(SITE, [{ slug: "x-y", title: "X Y", description: "açıklama" }]);
  assert.match(t, /^# TEFAS Fon Analiz\n\n> /);
  for (const s of ["GET https://ornek.com/fon/{KOD}", "GET https://ornek.com/api/holdings?ticker=EREGL&min=1", "https://ornek.com/api/funds/{yat|bes|byf|gyf|all}", "https://ornek.com/simulasyon?codes=KOD1,KOD2&monthly=5000", "- [X Y](https://ornek.com/tarama/x-y): açıklama", "429"])
    assert.ok(t.includes(s), s);
  assert.ok(!llmsTxt(SITE).includes("## Hazır taramalar"));
});

test("jsonLd: WebSite + WebPage + Breadcrumb tek @graph, </script> kaçışı", () => {
  const s = jsonLd(SITE, { path: "/fon/AAA", title: "AAA </script><b>", description: "d" }, [{ name: "Yatırım Fonları", path: "/fonlar/yat" }, { name: "AAA", path: "/fon/AAA" }]);
  assert.ok(!s.includes("</script>"));
  const j = JSON.parse(s);
  assert.equal(j["@context"], "https://schema.org");
  const [site, page, crumbs] = j["@graph"];
  assert.equal(site["@id"], "https://ornek.com/#website");
  assert.equal(page["@id"], "https://ornek.com/fon/AAA#webpage");
  assert.deepEqual(page.isPartOf, { "@id": "https://ornek.com/#website" });
  assert.equal(page.name, "AAA </script><b>");
  assert.deepEqual(crumbs.itemListElement.map((c) => [c.position, c.item]), [[1, "https://ornek.com/fonlar/yat"], [2, "https://ornek.com/fon/AAA"]]);
  assert.equal(JSON.parse(jsonLd(SITE, { path: "/", title: "t", description: "d" }))["@graph"].length, 2); // kırıntı yoksa yok
});

test("fundOgSvg: 1200x630, ad kaçışı ve kısaltma, getiri rengi, çizgi", () => {
  const svg = fundOgSvg({ code: "AAA", name: "A & B <PORTFÖY> " + "X".repeat(80), kind: "YAT", ret1y: 12.345, ret1m: -1.5, size: 2.5e9, prices: [1, 2, 0, 3], date: "2026-10-10" });
  assert.match(svg, /^<svg [^>]*width="1200" height="630"/);
  assert.ok(svg.includes("A &amp; B &lt;PORTFÖY&gt;") && svg.includes("…"));
  assert.ok(svg.includes("+12,3%") && svg.includes("-1,5%") && svg.includes("2,5 mr ₺") && svg.includes("10.10.2026"));
  assert.equal((svg.match(/<polyline points="([^"]+)"/)[1].split(" ")).length, 3); // fiyat 0 atlanır
  const empty = fundOgSvg({ code: "BBB", name: "B", kind: "EMK", ret1y: null, ret1m: null, size: null, prices: [], date: "2026-10-10" });
  assert.ok(!empty.includes("<polyline") && empty.includes("–"));
});

const f = (code, o = {}) => ({ code, name: code, kind: "YAT", type: "Hisse Senedi", active: true, fx: false, qualified: false, size: 50e6, investors: 100, risk: 5, m1: 1, m3: 2, y1: 10, flow_m1: 0, ...o });

test("runScan: aktif, filtre, boş değer atılır, yöne göre sıralı, limit", () => {
  const s = SCANS.find((x) => x.slug === "en-cok-kazandiran-hisse-fonlari");
  const funds = [f("A", { y1: 5 }), f("B", { y1: 30 }), f("C", { y1: 50, active: false }), f("D", { y1: null }), f("E", { y1: 99, type: "Değişken" }), f("F", { y1: 70, size: 1e6 })];
  assert.deepEqual(runScan(s, funds).map((x) => x.code), ["B", "A"]);
  assert.deepEqual(runScan(s, funds, 1).map((x) => x.code), ["B"]);
  const out = SCANS.find((x) => x.slug === "en-cok-para-cikisi");
  assert.deepEqual(runScan(out, [f("A", { flow_m1: -5 }), f("B", { flow_m1: -50 }), f("C", { flow_m1: 10 })]).map((x) => x.code), ["B", "A"]);
});

test("SCANS: slug'lar tekil ve URL güvenli, kolonlar tanımlı", () => {
  assert.equal(new Set(SCANS.map((s) => s.slug)).size, SCANS.length);
  for (const s of SCANS) assert.match(s.slug, /^[a-z0-9-]+$/);
});
