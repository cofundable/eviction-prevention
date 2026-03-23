import type { APIRoute } from "astro";
import { getCsaFeatures } from "../../../lib/db";

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as { runtime: { env: { DB: D1Database } } }).runtime.env.DB;
  const data = await getCsaFeatures(db);
  return new Response(JSON.stringify({ data }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
