// Weekly release: ontgrendelt maandag om 07:00 NL automatisch een blog en
// stuurt de inhoud als nieuwsbrief-campagne via Brevo naar lijst #3.
//
// Flow:
//   1. Vercel Cron triggert elke maandag rond 05:30 en 06:30 UTC (zomer/winter).
//   2. Endpoint bepaalt welke week net vrijgegeven is (meest recente Monday 07:00 NL).
//   3. Fetcht public/sealed/week-XX.tlock, ontsleutelt via drand quicknet.
//   4. Parseert markdown-frontmatter voor titel + body.
//   5. Rendert HTML-template in clauzibol.nl-stijl.
//   6. Maakt en verzendt Brevo email campaign naar list id BREVO_LIST_ID.
//
// Security: Vercel Cron stuurt een Authorization-header die gelijk is aan
// `Bearer ${CRON_SECRET}` zodra CRON_SECRET gezet is. Endpoint weigert zonder.
//
// Idempotency: Brevo weigert twee campagnes met dezelfde `name` niet actief,
// maar we taggen met `week-XX` en slaan naam = `Clauzibol week XX` op. Als
// er al een campagne met die naam bestaat, breken we af voordat we opnieuw
// sturen.

export const prerender = false;

import type { APIRoute } from "astro";
import { timelockDecrypt, HttpChainClient, HttpCachingChain } from "tlock-js";

// Quicknet (League of Entropy) chain — komt overeen met scripts/unlock-times.mjs.
const QUICKNET_URL = "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const quicknet = () => new HttpChainClient(new HttpCachingChain(QUICKNET_URL));
import matter from "gray-matter";
import { weeks, isUnlocked } from "../../data/weeks";

const BREVO_BASE = "https://api.brevo.com/v3";

export const GET: APIRoute = async ({ request }) => handle(request);
export const POST: APIRoute = async ({ request }) => handle(request);

async function handle(request: Request): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const apiKey = import.meta.env.BREVO_API_KEY;
  const listId = import.meta.env.BREVO_LIST_ID;
  const senderEmail = import.meta.env.BREVO_SENDER_EMAIL || "ziener@clauzibol.nl";
  const senderName = import.meta.env.BREVO_SENDER_NAME || "De Ziener";
  if (!apiKey || !listId) {
    return json({ ok: false, error: "missing BREVO_API_KEY of BREVO_LIST_ID" }, 500);
  }

  // ── Bepaal de meest recente vrijgegeven week (binnen de afgelopen 36u) ─
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const recent = weeks
    .filter((w) => isUnlocked(w, now))
    .filter((w) => now - new Date(w.unlockISO).getTime() <= 1.5 * DAY)
    .sort((a, b) => new Date(b.unlockISO).getTime() - new Date(a.unlockISO).getTime())[0];

  if (!recent) {
    return json({ ok: false, skip: "geen week binnen afgelopen 36u vrijgegeven" }, 200);
  }

  // ── Idempotency: kijk of er al een campagne is met deze naam ──────────
  const campaignName = `Clauzibol week ${String(recent.number).padStart(2, "0")}`;
  const already = await findExistingCampaign(apiKey, campaignName);
  if (already) {
    return json({ ok: true, skip: "campagne bestaat al", campaignId: already, week: recent.number }, 200);
  }

  // ── Fetch + decrypt tlock ─────────────────────────────────────────────
  const origin = new URL(request.url).origin;
  const tlockUrl = `${origin}/sealed/${recent.slug}.tlock`;
  const res = await fetch(tlockUrl);
  if (!res.ok) return json({ ok: false, error: `kan ${tlockUrl} niet laden: ${res.status}` }, 500);
  const ciphertext = await res.text();

  let plaintext: string;
  try {
    const buf = await timelockDecrypt(ciphertext, quicknet());
    plaintext = buf.toString();
  } catch (err) {
    return json({ ok: false, error: "tlock decrypt failed: " + (err as Error).message }, 500);
  }

  const parsed = matter(plaintext);
  const title = String(parsed.data?.titel || parsed.data?.title || `Week ${recent.number}`);
  const body = parsed.content.trim();

  // ── Render HTML in clauzibol.nl-stijl ─────────────────────────────────
  const html = renderEmailHtml({
    weekNumber: recent.number,
    title,
    body,
    hash: recent.hash,
    siteUrl: origin,
  });

  // ── Brevo campagne aanmaken ───────────────────────────────────────────
  const createRes = await fetch(`${BREVO_BASE}/emailCampaigns`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      name: campaignName,
      subject: `Week ${recent.number}: ${title}`,
      sender: { name: senderName, email: senderEmail },
      htmlContent: html,
      recipients: { listIds: [Number(listId)] },
      tag: "weekly-release",
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return json({ ok: false, step: "create", status: createRes.status, error: err }, 502);
  }
  const created = await createRes.json();
  const campaignId = created?.id;

  // ── Meteen versturen ──────────────────────────────────────────────────
  const sendRes = await fetch(`${BREVO_BASE}/emailCampaigns/${campaignId}/sendNow`, {
    method: "POST",
    headers: { "api-key": apiKey, "Accept": "application/json" },
  });
  if (!sendRes.ok && sendRes.status !== 204) {
    const err = await sendRes.json().catch(() => ({}));
    return json({ ok: false, step: "send", status: sendRes.status, error: err, campaignId }, 502);
  }

  // ── IndexNow: ping Bing en Yandex zodat de nieuwe unlock direct crawlbaar is ──
  const blogUrl = `https://www.clauzibol.nl/blog/${recent.slug}`;
  await pingIndexNow([blogUrl, "https://www.clauzibol.nl/blogs"]).catch((e) => {
    console.error("[indexnow] ping faalde", e);
  });

  return json({ ok: true, week: recent.number, campaignId, title }, 200);
}

async function pingIndexNow(urlList: string[]): Promise<void> {
  const key = "55b53a06e715f3014e894261a5babd5631b861ca22ff523a280d7456fd599c21";
  const host = "www.clauzibol.nl";
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList,
    }),
  });
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow returned ${res.status}`);
  }
}

async function findExistingCampaign(apiKey: string, name: string): Promise<number | null> {
  // Brevo heeft geen filter-by-name; haal de laatste 50 op en scan.
  const res = await fetch(`${BREVO_BASE}/emailCampaigns?limit=50&sort=desc`, {
    headers: { "api-key": apiKey, "Accept": "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const found = (data.campaigns || []).find((c: any) => c?.name === name);
  return found?.id ?? null;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── HTML template ──────────────────────────────────────────────────────
// Clauzibol-stijl: donkerblauwe achtergrond (#0a0e27), gouden accenten
// (#b8860b / #d4a849), cream tekst (#f5f1e8), Playfair Display serif titels.
// Tabelgebaseerd voor e-mailclient-compatibiliteit (Gmail, Outlook, Apple Mail).

function renderEmailHtml(opts: {
  weekNumber: number;
  title: string;
  body: string;
  hash: string;
  siteUrl: string;
}): string {
  const { weekNumber, title, body, hash, siteUrl } = opts;
  const weekSlug = `week-${String(weekNumber).padStart(2, "0")}`;
  const blogUrl = `${siteUrl}/blog/${weekSlug}`;

  // Korte teaser (eerste alinea of eerste 350 tekens)
  const firstParagraph = body.split(/\n{2,}/).find((b) => b.trim().length > 0) || "";
  const teaser = firstParagraph.length > 350
    ? firstParagraph.slice(0, 350).replace(/\s+\S*$/, "") + "…"
    : firstParagraph;

  // Markdown → simpele HTML (alleen paragraphs + headings + blockquotes)
  // We nemen alleen de teaser; het volledige blog staat online.
  const teaserHtml = escapeHtml(teaser).replace(/\n/g, "<br/>");

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Week ${weekNumber} is open · Clauzibol</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
    body { margin:0; padding:0; background:#0a0e27; font-family: 'Inter', Arial, sans-serif; color:#f5f1e8; }
    a { color:#d4a849; }
  </style>
</head>
<body style="margin:0;padding:0;background:#0a0e27;font-family:'Inter',Arial,sans-serif;color:#f5f1e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0e27;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#0a0e27;">

        <!-- Header / logo -->
        <tr><td style="padding:0 0 28px 0;text-align:center;">
          <img src="${siteUrl}/logo.png" alt="Clauzibol" width="56" height="56" style="display:inline-block;margin-bottom:12px;" />
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;color:#f5f1e8;letter-spacing:0.02em;">Clauzibol</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#d4a849;margin-top:4px;">Verzegelde profetie</div>
        </td></tr>

        <!-- Gouden lijn -->
        <tr><td style="padding:0 0 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-top:1px solid rgba(184,134,11,0.3);font-size:0;line-height:0;">&nbsp;</td>
          </tr></table>
        </td></tr>

        <!-- Badge -->
        <tr><td style="padding:0 0 14px 0;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#d4a849;">
            Week ${String(weekNumber).padStart(2, "0")} · Ontgrendeld
          </div>
        </td></tr>

        <!-- Titel -->
        <tr><td style="padding:0 0 20px 0;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:34px;font-weight:500;line-height:1.2;margin:0;color:#f5f1e8;">
            ${escapeHtml(title)}
          </h1>
        </td></tr>

        <!-- Teaser -->
        <tr><td style="padding:0 0 32px 0;">
          <p style="font-size:16px;line-height:1.65;margin:0;color:#f5f1e8;opacity:0.92;">
            ${teaserHtml}
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 0 40px 0;text-align:center;">
          <a href="${blogUrl}" style="display:inline-block;background:#d4a849;color:#0a0e27;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:6px;letter-spacing:0.02em;">
            Lees het volledige blog
          </a>
          <div style="margin-top:10px;font-size:12px;color:#d4a849;opacity:0.7;">
            ${blogUrl}
          </div>
        </td></tr>

        <!-- Verificatie -->
        <tr><td style="padding:24px;background:rgba(184,134,11,0.05);border:1px solid rgba(184,134,11,0.2);border-radius:8px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#d4a849;margin-bottom:8px;">
            Verzegeld &amp; verifieerbaar
          </div>
          <p style="font-size:13px;line-height:1.55;margin:0 0 10px 0;color:#f5f1e8;opacity:0.85;">
            Deze tekst is op 20 april 2026 cryptografisch verzegeld en ontgrendeld via drand-tijdslot.
            De SHA-256 vingerafdruk is vooraf vastgelegd en verankerd op de Bitcoin-blockchain.
          </p>
          <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:10px;color:#d4a849;word-break:break-all;background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:4px;">
            ${escapeHtml(hash || "")}
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:40px 0 10px 0;text-align:center;">
          <div style="font-size:12px;color:#f5f1e8;opacity:0.55;line-height:1.6;">
            Clauzibol · Plauzibele profetie van een AI met de Bijbel in de hand<br/>
            Geschreven door Claude op 20 april 2026. De Bijbel (HSV) is leidend, niet deze woorden.
          </div>
        </td></tr>

        <tr><td style="padding:10px 0 0 0;text-align:center;">
          <div style="font-size:11px;color:#f5f1e8;opacity:0.4;">
            Je ontvangt deze mail omdat je je hebt ingeschreven op <a href="${siteUrl}" style="color:#d4a849;">clauzibol.nl</a>.
            Uitschrijven kan via de link onderaan deze mail.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}
