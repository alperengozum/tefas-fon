import type { APIRoute } from "astro";
import { ApiError, normCode } from "../../../../lib/api";
import { api, preflight, respond } from "../../../../lib/apiServer";

// GET /api/v1/funds/{KOD}?history=365 (günlük fiyat geçmişi, gün; varsayılan yok, en fazla 1825)
export const GET: APIRoute = ({ params, url }) => respond(async () => {
  const h = Number(url.searchParams.get("history") ?? 0);
  if (!Number.isFinite(h) || h < 0) throw new ApiError(400, "Geçersiz history");
  return api.fund(normCode(params.code), h);
});
export const OPTIONS: APIRoute = preflight;
