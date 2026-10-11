import type { APIRoute } from "astro";
import { openapi } from "../../../lib/openapi";
import { abs } from "../../../lib/seo";
import { CORS } from "../../../lib/apiServer";

export const GET: APIRoute = ({ site }) =>
  new Response(JSON.stringify(openapi(abs(site, "/").replace(/\/$/, ""))), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", ...CORS },
  });
