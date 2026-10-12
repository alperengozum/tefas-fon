import type { APIRoute } from "astro";
import { getBench, listFunds } from "../../../lib/db";
import { PERIOD_DAYS, ret } from "../../../lib/analytics";
import { encodeFunds } from "../../../lib/compact";

const KINDS: Record<string, string> = { yat: "YAT", bes: "EMK", byf: "BYF", gyf: "GYF" };
// Cloudflare/tarayıcıda 5 dk taze; sonrasında 1 saate kadar bayat sunulup arkada yenilenir (veri günde bir değişir)
const CACHE = "public, max-age=300, stale-while-revalidate=3600";

// Liste verisi HTML'e gömülmek yerine ayrı, önbelleklenebilir JSON: sayfa kabuğu küçülür, veri Cloudflare'de tutulur.
// ETag: veri tarihi + uzunluk (günde bir değişir), yenilemede 304 döner.
export const GET: APIRoute = async ({ params, request }) => {
  // "all": tüm türler (fon seçici). ponytail: her istekte yeniden kodlanır (~ms); yavaşlarsa birleşik diziyi önbelleğe al
  const kinds = params.tur === "all" ? Object.values(KINDS) : [KINDS[params.tur ?? ""]];
  if (!kinds[0]) return new Response(null, { status: 404 });
  const [parts, bench] = await Promise.all([Promise.all(kinds.map(listFunds)), getBench()]);
  const ref = parts[0].ref;
  const funds = parts.length === 1 ? parts[0].funds : parts.flatMap((p) => p.funds);
  // USD bazında getiri için USD/TRY'nin aynı vadelerdeki getirisi (seri yoksa alan gönderilmez, istemci USD seçeneğini gizler)
  const usd = bench.USD?.length ? Object.fromEntries(PERIOD_DAYS.map(([k, d]) => [k, ret(bench.USD, d)])) : undefined;
  const body = encodeFunds(funds, usd ? { usd } : {});
  const etag = `"${ref}-${body.length}"`;
  const headers = { ETag: etag, "Cache-Control": CACHE };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
};
