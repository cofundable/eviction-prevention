import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env =
    (locals as { runtime?: { env?: Record<string, string> } }).runtime?.env ??
    {};
  const apiUrl = env.CONTACT_FORM_API_URL ?? process.env.CONTACT_FORM_API_URL;
  const apiToken =
    env.CONTACT_FORM_API_TOKEN ?? process.env.CONTACT_FORM_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return new Response(
      JSON.stringify({ error: "Contact form not configured." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { name, email, intent, message } = body as Record<string, string>;
  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: "Missing required fields." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      field_7776477: name,
      field_7776478: email,
      field_7776479: intent,
      field_7776480: message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Baserow error:", res.status, text);
    return new Response(JSON.stringify({ error: "Failed to submit." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
