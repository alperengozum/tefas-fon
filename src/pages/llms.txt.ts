import type { APIRoute } from "astro";
import { llmsTxt } from "../lib/seo";
import { SCANS } from "../lib/scans";

export const GET: APIRoute = ({ site }) =>
  new Response(llmsTxt(site, SCANS), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
