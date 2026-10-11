import type { APIRoute } from "astro";

// Coolify healthcheck (GET localhost:4321/healthz -> 200 "ok"). Bilerek DB'ye dokunmaz: DB düşünce konteyner unhealthy olursa
// Traefik trafiği keser ve kullanıcı 500 sayfası yerine proxy hatası görür. Amaç deploy'da sürecin ayağa kalktığını doğrulamak.
// İçeriden (127.0.0.1/::1) geldiği için middleware rate limit'ine takılmaz.
export const GET: APIRoute = () =>
  new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
