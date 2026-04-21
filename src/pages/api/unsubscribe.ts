// Server-side endpoint: verwijdert een e-mailadres uit de Brevo-nieuwsbrieflijst.
// Gebruikt HMAC-token uit subscribe.ts om te verifiëren dat de aanvrager daadwerkelijk
// via een geldige mailink komt. Redirect altijd naar /uitschrijven met een status-param,
// zodat zowel GET (link in mail) als POST (List-Unsubscribe-Post one-click) werken.

export const prerender = false;

import type { APIRoute } from "astro";
import { unsubscribeToken } from "./subscribe";

export const GET: APIRoute = async ({ request }) => handle(request);
export const POST: APIRoute = async ({ request }) => handle(request);

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let email = (url.searchParams.get("e") || "").trim().toLowerCase();
  let token = url.searchParams.get("t") || "";

  // POST-body (formulier op /uitschrijven) kan ook email/token meegeven
  if (!email && request.method === "POST") {
    try {
      const body = await request.json();
      email = String(body.email ?? "").trim().toLowerCase();
      token = String(body.token ?? token);
    } catch { /* ignore */ }
  }

  const redirectTo = (status: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ status, ...extra });
    return new Response(null, { status: 302, headers: { Location: `/uitschrijven?${qs}` } });
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirectTo("invalid");
  }
  if (!token || token !== unsubscribeToken(email)) {
    return redirectTo("invalid_token", { e: email });
  }

  const apiKey = import.meta.env.BREVO_API_KEY;
  const listId = import.meta.env.BREVO_LIST_ID;
  if (!apiKey || !listId) return redirectTo("server_error");

  try {
    const resp = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/remove`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ emails: [email] }),
    });

    // 201 of 204 = succes. 400 met "contact_not_exists" of "already_removed" is ook OK.
    const data = await resp.json().catch(() => ({} as any));
    const benignCodes = ["contact_not_exists", "contact_already_removed_from_list", "invalid_parameter"];
    if (!resp.ok && !benignCodes.includes(data?.code)) {
      console.error("[brevo] unsubscribe error", resp.status, data);
      return redirectTo("server_error", { e: email });
    }
    return redirectTo("ok", { e: email });
  } catch (err) {
    console.error("[brevo] unsubscribe threw", err);
    return redirectTo("server_error", { e: email });
  }
}
