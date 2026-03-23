export const prerender = false;
import type { APIRoute } from "astro";
import { getCases } from "../../../lib/db";

export const GET: APIRoute = async ({ url, locals }) => {
  const db = (locals as { runtime: { env: { DB: D1Database } } }).runtime.env
    .DB;
  const csa = url.searchParams.get("csa") ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10))
  );

  const result = await getCases(db, { csa, page, limit });
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
