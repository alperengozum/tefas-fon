import type { APIRoute } from "astro";
import { allTickers, listFunds } from "../lib/db";
import { abs, sitemapXml, type SitemapEntry } from "../lib/seo";
import { SCANS } from "../lib/scans";
import { aggregate } from "../lib/founders";

// Fon ve hisse sayfaları SSR (dinamik), @astrojs/sitemap göremez: DB'den üretilir. Pasif (tasfiye/birleşme) fonlar dahil değil.
// ~2500 URL, tek dosya (sınır 50.000). Liste sorguları önbellekte (listFunds), istek ucuz.
const KINDS = ["YAT", "EMK", "BYF", "GYF"];
export const GET: APIRoute = async ({ site }) => {
  const [lists, tickers] = await Promise.all([Promise.all(KINDS.map(listFunds)), allTickers()]);
  const ref = lists[0].ref || null;
  const e = (path: string, priority: number, lastmod: string | null = ref): SitemapEntry => ({ loc: abs(site, path), lastmod, priority });
  const entries = [
    ...["yat", "bes", "byf", "gyf"].map((k) => e(`/fonlar/${k}`, 1)),
    e("/tarama", 0.8), ...SCANS.map((s) => e(`/tarama/${s.slug}`, 0.8)),
    e("/kurucu", 0.7), ...[...new Set(lists.flatMap((l) => aggregate(l.funds).map((r) => r.slug)))].map((sl) => e(`/kurucu/${sl}`, 0.6)),
    ...["/karsilastir", "/hisse", "/portfoy", "/simulasyon"].map((p) => e(p, 0.5, null)),
    ...lists.flatMap((l) => l.funds.filter((f) => f.active).map((f) => e(`/fon/${f.code}`, 0.7))),
    ...tickers.map((t) => e(`/hisse/${encodeURIComponent(t)}`, 0.4)),
  ];
  return new Response(sitemapXml(entries), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
