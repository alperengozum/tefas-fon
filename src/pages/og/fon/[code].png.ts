import type { APIRoute } from "astro";
import { getFund } from "../../../lib/db";
import { ret } from "../../../lib/analytics";
import { fundOgSvg } from "../../../lib/seo";

// Fon başına paylaşım görseli (1200x630 PNG): kod, ad, 1Y/1A getiri, büyüklük, son 1 yıl fiyat çizgisi.
// sharp astro'nun opsiyonel bağımlılığı (prod imajında da kurulu); yüklenemezse genel görsele yönlendirilir.
export const GET: APIRoute = async ({ params, redirect }) => {
  const f = await getFund((params.code ?? "").toUpperCase());
  if (!f) return new Response(null, { status: 404 });
  const last = f.history[f.history.length - 1];
  const cut = new Date(new Date(last.date).getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const svg = fundOgSvg({
    code: f.code, name: f.name, kind: f.kind, date: last.date, size: last.size,
    ret1y: ret(f.history, 365), ret1m: ret(f.history, 30),
    prices: f.history.filter((r) => r.date >= cut).map((r) => r.price),
  });
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    console.log("og görseli üretilemedi:", (e as Error).message);
    return redirect("/og-image.png", 302);
  }
};
