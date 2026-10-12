// /api/v1 ve /mcp rotalarının ortak bağlamı: DB'ye bağlı API örneği ve JSON yanıt yardımcıları (CORS açık, kimlik doğrulama yok).
import { getBench, getFund, getHoldings, listFunds, tickerFunds } from "./db";
import { ApiError, makeApi } from "./api";
import { mcpTools } from "./mcpTools";

export const api = makeApi({ listFunds, getFund, getHoldings, getBench, tickerFunds });
export const tools = mcpTools(api);

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};
const CACHE = "public, max-age=300, stale-while-revalidate=3600"; // veri günde bir değişir

export const json = (body: unknown, status = 200, cache = true) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...(cache && status === 200 ? { "Cache-Control": CACHE } : { "Cache-Control": "no-store" }) } });

// Rota gövdesi: ApiError -> {error} + durum kodu; beklenmeyen hata -> 500 (ayrıntı loga)
export async function respond(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error("api hatası", e);
    return json({ error: "Sunucu hatası" }, 500);
  }
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });
