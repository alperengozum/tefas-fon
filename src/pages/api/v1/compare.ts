import type { APIRoute } from "astro";
import { api, preflight, respond } from "../../../lib/apiServer";

// GET /api/v1/compare?codes=AFT,TCD (ya da codes=AFT&codes=TCD): 2-10 fon, getiriler + 1 yıl korelasyon
export const GET: APIRoute = ({ url }) => respond(() =>
  api.compare(url.searchParams.getAll("codes").flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean)));
export const OPTIONS: APIRoute = preflight;
