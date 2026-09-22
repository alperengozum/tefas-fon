import type { APIRoute } from "astro";
import { fundsHolding } from "../../lib/db";

export const GET: APIRoute = async ({ url }) => {
  const ticker = (url.searchParams.get("ticker") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const min = Math.min(Math.max(Number(url.searchParams.get("min")) || 0, 0), 100);
  const body = ticker.length >= 2 ? await fundsHolding(ticker, min) : {};
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
};
