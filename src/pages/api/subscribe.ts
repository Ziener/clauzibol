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

    const data = await resp.json().catch(() => ({} as any));
    const alreadyOnList = resp.status === 400 && data?.code === "duplicate_parameter";

    if (!resp.ok && !alreadyOnList) {
      console.error("[brevo] error", resp.status, data);
      return json({ ok: false, error: data?.message || `Brevo ${resp.status}` }, 502);
    }

    // Welkomstmail alleen voor NIEUWE inschrijvingen (niet bij duplicates)
    if (!alreadyOnList) {
      const siteUrl = new URL(request.url).origin;
      const senderEmail = import.meta.env.BREVO_SENDER_EMAIL || "ziener@clauzibol.nl";
      const senderName = import.meta.env.BREVO_SENDER_NAME || "De Ziener";
      await sendWelcomeEmail({ apiKey, email, senderEmail, senderName, siteUrl }).catch((e) => {
        // Welkomstmail mag niet de hele inschrijving blokkeren
        console.error("[brevo] welkomstmail faalde", e);
      });
    }

    return json({ ok: true, already: alreadyOnList }, 200);
  } catch (err) {
    console.error("[brevo] fetch threw", err);
    return json({ ok: false, error: "Kon Brevo niet bereiken." }, 502);
  }
};

// ── Welkomstmail (transactional via Brevo /v3/smtp/email) ───────────────
async function sendWelcomeEmail(opts: {
  apiKey: string;
  email: string;
  senderEmail: string;
  senderName: string;
  siteUrl: string;
}): Promise<void> {
  const { apiKey, email, senderEmail, senderName, siteUrl } = opts;
  const htmlContent = renderWelcomeHtml(siteUrl);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject: "Welkom bij Clauzibol",
      htmlContent,
      tags: ["welcome"],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`smtp/email ${res.status}: ${JSON.stringify(err)}`);
  }
}

function renderWelcomeHtml(siteUrl: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Welkom bij Clauzibol</title>
</head>
<body style="margin:0;padding:0;background:#0a0e27;font-family:'Inter',Arial,sans-serif;color:#f5f1e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0e27;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="padding:0 0 28px 0;text-align:center;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;color:#f5f1e8;letter-spacing:0.02em;">Clauzibol</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#d4a849;margin-top:4px;">Verzegelde profetie</div>
        </td></tr>

        <!-- Gouden lijn -->
        <tr><td style="padding:0 0 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-top:1px solid rgba(184,134,11,0.3);font-size:0;line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>

        <!-- Welkom-badge -->
        <tr><td style="padding:0 0 14px 0;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#d4a849;">
            Welkom
          </div>
        </td></tr>

        <!-- Titel -->
        <tr><td style="padding:0 0 20px 0;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:32px;font-weight:500;line-height:1.25;margin:0;color:#f5f1e8;">
            Fijn dat je er bent
          </h1>
        </td></tr>

        <!-- Intro -->
        <tr><td style="padding:0 0 24px 0;">
          <p style="font-size:16px;line-height:1.65;margin:0;color:#f5f1e8;opacity:0.92;">
            Je staat op de lijst voor de wekelijkse release van Clauzibol. Elke maandagochtend om
            07:00 uur Nederlandse tijd ontgrendelt er één slot, en krijg je van ons een mail met
            de vrijgegeven blog.
          </p>
        </td></tr>

        <!-- Uitleg-blok -->
        <tr><td style="padding:0 0 24px 0;">
          <div style="padding:24px;background:rgba(184,134,11,0.05);border:1px solid rgba(184,134,11,0.2);border-radius:8px;">
            <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:500;margin:0 0 10px 0;color:#d4a849;">
              Wat is Clauzibol?
            </h2>
            <p style="font-size:14px;line-height:1.65;margin:0 0 10px 0;color:#f5f1e8;opacity:0.9;">
              Clauzibol is een experiment in eerlijke profetie. Op 20 april 2026 heeft
              <strong>Claude</strong> (een AI van Anthropic) met de Bijbel (HSV) in de hand 52 blogs
              geschreven, één voor elke week van het komende jaar. Alle 52 zijn op de schrijfdatum
              cryptografisch verzegeld met time-lock encryption. Niemand, ook Claude en de maker niet,
              kan de tekst eerder lezen of aanpassen.
            </p>
            <p style="font-size:14px;line-height:1.65;margin:0;color:#f5f1e8;opacity:0.9;">
              Vanaf <strong>4 mei 2026</strong> opent elke maandagochtend één slot. De tekst die
              tevoorschijn komt, produceert exact de vooraf vastgelegde SHA-256 vingerafdruk, verankerd
              op de Bitcoin-blockchain. Geen sensatie. Wel bezinning. Plauzibele profetie, waterdicht
              bewijsbaar.
            </p>
          </div>
        </td></tr>

        <!-- De naam -->
        <tr><td style="padding:0 0 24px 0;">
          <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:500;margin:0 0 10px 0;color:#d4a849;">
            De naam: Clau &middot; zi &middot; bol
          </h2>
          <p style="font-size:14px;line-height:1.65;margin:0;color:#f5f1e8;opacity:0.9;">
            <strong>Clau</strong> van Claude (de auteur). <strong>Zi</strong> van ziener
            ("wie nu profeet genoemd wordt, noemde men vroeger een ziener", 1 Samuël 9:9 HSV).
            <strong>Bol</strong> klinkt naar plauzibel &mdash; plausibele profetie, doordacht,
            geen wilde gok.
          </p>
        </td></tr>

        <!-- Verwachting -->
        <tr><td style="padding:0 0 28px 0;">
          <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:500;margin:0 0 10px 0;color:#d4a849;">
            Wat kun je verwachten?
          </h2>
          <p style="font-size:14px;line-height:1.65;margin:0;color:#f5f1e8;opacity:0.9;">
            Vanaf maandag 4 mei krijg je 52 weken lang, elke maandagochtend, een korte mail. Geen
            reclame, geen ruis, geen tracking-pixels. Alleen de nieuwe blog met een klik naar de
            site. Uitschrijven kan altijd via de link onderaan elke mail.
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 0 40px 0;text-align:center;">
          <a href="${siteUrl}/over" style="display:inline-block;background:#d4a849;color:#0a0e27;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:6px;letter-spacing:0.02em;">
            Lees meer over Clauzibol
          </a>
        </td></tr>

        <!-- Bijbeltekst -->
        <tr><td style="padding:0 0 32px 0;">
          <blockquote style="border-left:2px solid #d4a849;padding-left:18px;margin:0;font-style:italic;color:#d4a849;opacity:0.9;font-size:14px;line-height:1.6;">
            &ldquo;Wees dan waakzaam, want u weet niet op welk moment uw Heere komen zal.&rdquo;
            &mdash; Mattheüs 24:42 (HSV)
          </blockquote>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0 10px 0;text-align:center;border-top:1px solid rgba(184,134,11,0.15);">
          <div style="font-size:12px;color:#f5f1e8;opacity:0.55;line-height:1.6;padding-top:20px;">
            Clauzibol &middot; Plauzibele profetie van een AI met de Bijbel in de hand<br/>
            Aan de blogs kunnen geen rechten worden ontleend. De Bijbel (HSV) is leidend, niet deze woorden.
          </div>
        </td></tr>

        <tr><td style="padding:10px 0 0 0;text-align:center;">
          <div style="font-size:11px;color:#f5f1e8;opacity:0.4;">
            Je ontvangt deze mail omdat je je hebt ingeschreven op <a href="${siteUrl}" style="color:#d4a849;">clauzibol.nl</a>.
            Uitschrijven kan via de link onderaan elke volgende mail.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
