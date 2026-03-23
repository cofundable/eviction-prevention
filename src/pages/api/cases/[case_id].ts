import type { APIRoute } from "astro";
import { getCaseById } from "../../../lib/db";

export const GET: APIRoute = async ({ params, locals }) => {
  const db = (locals as { runtime: { env: { DB: D1Database } } }).runtime.env.DB;
  const caseId = params.case_id ?? "";

  if (!caseId) {
    return new Response(JSON.stringify({ error: "Case ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await getCaseById(db, caseId);
  if (!data) {
    return new Response(JSON.stringify({ error: "Case not found" }), {
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
