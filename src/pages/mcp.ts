import type { APIRoute } from "astro";
import { handleMessage } from "../lib/mcp";
import { CORS, json, preflight, tools } from "../lib/apiServer";

// MCP Streamable HTTP uç noktası, durumsuz: her POST tek JSON-RPC mesajı, yanıt JSON (SSE akışı yok).
// GET (sunucudan istemciye SSE) desteklenmiyor: spesifikasyona göre 405.
export const POST: APIRoute = async ({ request }) => {
  let msg: unknown;
  try {
    msg = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON ayrıştırılamadı" } }, 400, false);
  }
  try {
    const res = await handleMessage(msg, tools);
    return res ? json(res, 200, false) : new Response(null, { status: 202, headers: CORS });
  } catch (e) {
    console.error("mcp hatası", e);
    const id = msg && typeof msg === "object" && "id" in msg ? (msg as { id: string | number | null }).id : null;
    return json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Sunucu hatası" } }, 500, false);
  }
};
const notAllowed = () => new Response("MCP: yalnız POST (durumsuz, SSE yok)", { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
export const GET: APIRoute = notAllowed;
export const DELETE: APIRoute = notAllowed;
export const OPTIONS: APIRoute = preflight;
