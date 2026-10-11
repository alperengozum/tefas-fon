import type { APIRoute } from "astro";
import { api, preflight, respond } from "../../../../lib/apiServer";

// GET /api/v1/scans/{slug}?limit=20: hazır tarama sonucu (slug listesi: /api/v1/openapi.json)
export const GET: APIRoute = ({ params, url }) => respond(() => api.scan(params.slug ?? "", Number(url.searchParams.get("limit") ?? 20) || 20));
export const OPTIONS: APIRoute = preflight;
