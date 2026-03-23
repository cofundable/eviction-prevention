export const prerender = false;
import type { APIRoute } from "astro";
import { getCsaDetail, getCsaFeatures } from "../../../lib/db";
import { toSlug } from "../../../lib/utils";

export const GET: APIRoute = async ({ params, locals }) => {
  const db = (locals as { runtime: { env: { DB: D1Database } } }).runtime.env
    .DB;
  const slug = params.slug ?? "";

  if (!slug) {
    return new Response(JSON.stringify({ error: "CSA slug is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve slug → canonical CSA name
  const allFeatures = await getCsaFeatures(db);
  const match = allFeatures.find((f) => toSlug(f.csa) === slug);

  if (!match) {
    return new Response(JSON.stringify({ error: "CSA not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await getCsaDetail(db, match.csa);
  return new Response(JSON.stringify({ ...data, slug }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
