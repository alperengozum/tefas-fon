import { defineMiddleware } from "astro:middleware";

// Uygulamanın kendi işleme süresi: Server-Timing başlığına yazılır, 800ms üstü loga düşer (sunucu/ağ yavaşlığından ayırt etmek için).
export const onRequest = defineMiddleware(async (ctx, next) => {
  const t = performance.now();
  const res = await next();
  const ms = performance.now() - t;
  res.headers.set("Server-Timing", `app;dur=${ms.toFixed(0)}`);
  // Veri günde bir güncellenir: tarayıcı 1 dk, paylaşımlı önbellek (Cloudflare Cache Rule ile) 10 dk taze, sonra arkada yenilenerek 1 saat bayat servis edilebilir.
  if (res.status === 200 && /^\/(fonlar|fon|karsilastir|api\/funds)(\/|$)/.test(ctx.url.pathname))
    res.headers.set("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=3600");
  if (ms > 800) console.log(`yavaş istek ${ctx.url.pathname} ${ms.toFixed(0)}ms`);
  return res;
});
