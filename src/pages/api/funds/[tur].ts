import type { APIRoute } from "astro";
import { listFunds } from "../../../lib/db";
import { encodeFunds } from "../../../lib/compact";

const KINDS: Record<string, string> = { yat: "YAT", bes: "EMK", byf: "BYF", gyf: "GYF" };

// Liste verisi HTML'e gömülmek yerine ayrı, önbelleklenebilir JSON: sayfa kabuğu küçülür, veri Cloudflare'de tutulur.
// Cache-Control middleware'de. ETag: veri tarihi + uzunluk (günde bir değişir), yenilemede 304 döner.
export const GET: APIRoute = async ({ params, request }) => {
  const kind = KINDS[params.tur ?? ""];
  if (!kind) return new Response(null, { status: 404 });
  const { ref, funds } = await listFunds(kind);
  const body = encodeFunds(funds);
  const etag = `"${ref}-${body.length}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(body, { headers: { "Content-Type": "application/json", ETag: etag } });
};
