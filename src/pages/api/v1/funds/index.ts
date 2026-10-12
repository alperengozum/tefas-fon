import type { APIRoute } from "astro";
import { ApiError, parseKind, parseSort } from "../../../../lib/api";
import { api, preflight, respond } from "../../../../lib/apiServer";

// GET /api/v1/funds?kind=yat&q=altın&type=&founder=&sort=y1&order=desc&min_size=&active=1&limit=20&offset=0
export const GET: APIRoute = ({ url }) => respond(async () => {
  const p = url.searchParams, n = (k: string) => (p.has(k) ? Number(p.get(k)) : undefined);
  const limit = n("limit"), offset = n("offset"), minSize = n("min_size");
  for (const [k, v] of [["limit", limit], ["offset", offset], ["min_size", minSize]] as const)
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) throw new ApiError(400, `Geçersiz ${k}`);
  const order = p.get("order") ?? "desc";
  if (order !== "asc" && order !== "desc") throw new ApiError(400, "order asc ya da desc olmalı");
  return api.funds(parseKind(p.get("kind") ?? "all"), {
    query: p.get("q") ?? undefined, type: p.get("type") ?? undefined, founder: p.get("founder") ?? undefined,
    sort: parseSort(p.get("sort")), order, limit, offset, minSize, activeOnly: p.get("active") !== "0",
  });
});
export const OPTIONS: APIRoute = preflight;
