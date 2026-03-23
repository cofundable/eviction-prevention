import type { APIRoute } from "astro";
import { getCsaDetail } from "../../../lib/db";

export const GET: APIRoute = async ({ params, locals }) => {
  const db = (locals as { runtime: { env: { DB: D1Database } } }).runtime.env.DB;
  const name = decodeURIComponent(params.name ?? "");

  if (!name) {
    return new Response(JSON.stringify({ error: "CSA name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await getCsaDetail(db, name);
  if (!data) {
    return new Response(JSON.stringify({ error: "CSA not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
