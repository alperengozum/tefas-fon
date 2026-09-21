import { defineMiddleware } from "astro:middleware";

// Uygulamanın kendi işleme süresi: Server-Timing başlığına yazılır, 800ms üstü loga düşer (sunucu/ağ yavaşlığından ayırt etmek için).
export const onRequest = defineMiddleware(async (ctx, next) => {
  const t = performance.now();
  const res = await next();
  const ms = performance.now() - t;
  res.headers.set("Server-Timing", `app;dur=${ms.toFixed(0)}`);
  if (ms > 800) console.log(`yavaş istek ${ctx.url.pathname} ${ms.toFixed(0)}ms`);
  return res;
});
