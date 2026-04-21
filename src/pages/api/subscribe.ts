// Server-side endpoint: voegt een e-mailadres toe aan de Brevo-nieuwsbrieflijst.
// API key en list ID staan in Vercel environment variables (BREVO_API_KEY, BREVO_LIST_ID).
// Deze route draait als Vercel Function, niet als statische pagina.

export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.BREVO_API_KEY;
  const listId = import.meta.env.BREVO_LIST_ID;

  if (!apiKey || !listId) {
    return json({ ok: false, error: "Server mist BREVO_API_KEY of BREVO_LIST_ID." }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Ongeldige JSON." }, 400);
  }

  const email = String(body.email ?? body["E-mail"] ?? "").trim().toLowerCase();
  const honey = String(body._honey ?? "");
  const bron = String(body.Bron ?? body.source ?? "onbekend");

  // Spam: honeypot ingevuld
  if (honey) return json({ ok: true }, 200);

  // Basale e-mailvalidatie
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Vul een geldig e-mailadres in." }, 400);
  }

  try {
    const resp = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        email,
        listIds: [Number(listId)],
        updateEnabled: true, // bestaand contact bijwerken i.p.v. 400
        attributes: { BRON: bron, SIGNUP_SOURCE: "clauzibol.nl" },
      }),
    });

    if (resp.ok) return json({ ok: true }, 200);

    // Brevo geeft 400 met code "duplicate_parameter" als iemand al op de lijst staat
    // — daar niet over struikelen.
    const data = await resp.json().catch(() => ({} as any));
    if (data?.code === "duplicate_parameter") {
      return json({ ok: true, already: true }, 200);
    }
    console.error("[brevo] error", resp.status, data);
    return json({ ok: false, error: data?.message || `Brevo ${resp.status}` }, 502);
  } catch (err) {
    console.error("[brevo] fetch threw", err);
    return json({ ok: false, error: "Kon Brevo niet bereiken." }, 502);
  }
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
