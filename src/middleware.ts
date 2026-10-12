import { defineMiddleware } from "astro:middleware";
import { API_LIMIT } from "./lib/api";

// Güvenlik başlıkları. CSP sadece çerçeveleme/base/object'i kısıtlar: Astro ada hidrasyonu ve Recharts satır içi script/stil kullanır.
const SECURITY = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

// IP başına sabit pencereli istek sınırı (Cloudflare arkasında gerçek IP cf-connecting-ip'te).
// ponytail: tek süreç bellek sayacı, birden fazla replika olursa Cloudflare Rate Limiting kuralına taşınır.
// limiter(ip) -> { over, left, reset (sn) }
export function limiter(window: number, limit: number) {
  const hits = new Map<string, { t: number; n: number }>();
  return (ip: string, now = Date.now()) => {
    let h = hits.get(ip);
    if (!h || now - h.t > window) {
      if (hits.size > 10_000) hits.clear(); // bellek sınırı
      h = { t: now, n: 0 };
      hits.set(ip, h);
    }
    h.n++;
    return { over: h.n > limit, left: Math.max(0, limit - h.n), reset: Math.ceil((h.t + window - now) / 1000) };
  };
}
const site = limiter(10_000, 50);
export const limited = (ip: string, now = Date.now()) => site(ip, now).over;
// Herkese açık API ve MCP: agent döngüleri sitenin genel sınırını kolayca tüketmesin diye ayrı ve daha sıkı (dakikada 60)
const apiLimit = limiter(60_000, API_LIMIT);
const isApi = (p: string) => p.startsWith("/api/v1/") || p === "/mcp";

// Uygulamanın kendi işleme süresi: Server-Timing başlığına yazılır, 800ms üstü loga düşer (sunucu/ağ yavaşlığından ayırt etmek için).
export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered) return next(); // derleme zamanı (ör. /offline): istemci adresi yok, statik dosya olarak sunulur
  const ip = ctx.request.headers.get("cf-connecting-ip") ?? ctx.clientAddress;
  const local = ip === "127.0.0.1" || ip === "::1";
  if (!local && limited(ip))
    return new Response("Çok fazla istek", { status: 429, headers: { "Retry-After": "10", ...SECURITY } });
  const api = isApi(ctx.url.pathname) && ctx.request.method !== "OPTIONS" && !local ? apiLimit(ip) : null;
  const rl: Record<string, string> = api ? { "X-RateLimit-Limit": String(API_LIMIT), "X-RateLimit-Remaining": String(api.left), "X-RateLimit-Reset": String(api.reset) } : {};
  if (api?.over)
    return new Response(JSON.stringify({ error: `Çok fazla istek: IP başına dakikada ${API_LIMIT}` }), {
      status: 429, headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": String(api.reset), "Access-Control-Allow-Origin": "*", ...rl, ...SECURITY },
    });
  const t = performance.now();
  const res = await next();
  for (const [k, v] of Object.entries(rl)) res.headers.set(k, v);
  const ms = performance.now() - t;
  res.headers.set("Server-Timing", `app;dur=${ms.toFixed(0)}`);
  for (const [k, v] of Object.entries(SECURITY)) res.headers.set(k, v);
  if (ms > 800) console.log(`yavaş istek ${JSON.stringify(ctx.url.pathname)} ${ms.toFixed(0)}ms`);
  return res;
});
