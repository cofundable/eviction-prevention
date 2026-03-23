export const prerender = false;
import type { APIRoute } from "astro";
import { getCsaFeatures } from "../../../lib/db";
import { toSlug } from "../../../lib/utils";

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as { runtime: { env: { DB: D1Database } } }).runtime.env
    .DB;
  const rows = await getCsaFeatures(db);
  const data = rows.map((r) => ({ ...r, slug: toSlug(r.csa) }));
  return new Response(JSON.stringify({ data }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
