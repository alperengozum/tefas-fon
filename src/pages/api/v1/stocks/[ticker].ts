import type { APIRoute } from "astro";
import { ApiError, normTicker } from "../../../../lib/api";
import { api, preflight, respond } from "../../../../lib/apiServer";

// GET /api/v1/stocks/{HISSE}?min_weight=1: hisseyi tutan fonlar (son KAP raporu)
export const GET: APIRoute = ({ params, url }) => respond(async () => {
  const m = Number(url.searchParams.get("min_weight") ?? 0);
  if (!Number.isFinite(m) || m < 0 || m > 100) throw new ApiError(400, "min_weight 0-100 arası olmalı");
  return api.stockFunds(normTicker(params.ticker), m);
});
export const OPTIONS: APIRoute = preflight;
