import type { APIRoute } from "astro";
import { listFunds } from "../../../lib/db";
import { encodeFunds } from "../../../lib/compact";

const KINDS: Record<string, string> = { yat: "YAT", bes: "EMK", byf: "BYF", gyf: "GYF" };

// Liste verisi HTML'e gömülmek yerine ayrı, önbelleklenebilir JSON: sayfa kabuğu küçülür, veri Cloudflare'de tutulur.
// Cache-Control middleware'de. ETag: veri tarihi + uzunluk (günde bir değişir), yenilemede 304 döner.
export const GET: APIRoute = async ({ params, request }) => {
  // "all": tüm türler (fon seçici). ponytail: her istekte yeniden kodlanır (~ms); yavaşlarsa birleşik diziyi önbelleğe al
  const kinds = params.tur === "all" ? Object.values(KINDS) : [KINDS[params.tur ?? ""]];
  if (!kinds[0]) return new Response(null, { status: 404 });
  const parts = await Promise.all(kinds.map(listFunds));
  const ref = parts[0].ref;
  const funds = parts.length === 1 ? parts[0].funds : parts.flatMap((p) => p.funds);
  const body = encodeFunds(funds);
  const etag = `"${ref}-${body.length}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(body, { headers: { "Content-Type": "application/json", ETag: etag } });
};
