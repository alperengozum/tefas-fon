import { defineMiddleware } from "astro:middleware";

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
const WINDOW = 10_000, LIMIT = 50;
const hits = new Map<string, { t: number; n: number }>();
export function limited(ip: string, now = Date.now()): boolean {
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW) {
    if (hits.size > 10_000) hits.clear(); // bellek sınırı
    hits.set(ip, { t: now, n: 1 });
    return false;
  }
  return ++h.n > LIMIT;
}

// Uygulamanın kendi işleme süresi: Server-Timing başlığına yazılır, 800ms üstü loga düşer (sunucu/ağ yavaşlığından ayırt etmek için).
export const onRequest = defineMiddleware(async (ctx, next) => {
  const ip = ctx.request.headers.get("cf-connecting-ip") ?? ctx.clientAddress;
  if (ip !== "127.0.0.1" && ip !== "::1" && limited(ip))
    return new Response("Çok fazla istek", { status: 429, headers: { "Retry-After": "10", ...SECURITY } });
  const t = performance.now();
  const res = await next();
  const ms = performance.now() - t;
  res.headers.set("Server-Timing", `app;dur=${ms.toFixed(0)}`);
  for (const [k, v] of Object.entries(SECURITY)) res.headers.set(k, v);
  if (ms > 800) console.log(`yavaş istek ${JSON.stringify(ctx.url.pathname)} ${ms.toFixed(0)}ms`);
  return res;
});
