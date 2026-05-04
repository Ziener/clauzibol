// Like-counter voor blog-pagina's. Persistent via Upstash Redis REST API
// (compatible met Vercel KV — beide gebruiken dezelfde URL/token).
//
// Verwachte env vars (een van beide paren werkt):
//   - KV_REST_API_URL + KV_REST_API_TOKEN              (Vercel KV integration)
//   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash direct)
//
// Endpoints:
//   GET  /api/likes?slug=week-01           → { count }
//   GET  /api/likes?slugs=week-01,week-02  → { counts: { "week-01": 12, "week-02": 0 } }
//   POST /api/likes  { slug, action }      → { count }    action ∈ "like" | "unlike"
//
// Anti-abuse: client-side localStorage voorkomt dubbele likes vanuit één browser.
// Dit is voldoende voor een kleine, niet-financiele site. Voor zwaardere rate-
// limiting kan later een per-IP token bucket toegevoegd worden.

export const prerender = false;

import type { APIRoute } from "astro";

const KV_URL = (import.meta.env.KV_REST_API_URL as string | undefined) || (import.meta.env.UPSTASH_REDIS_REST_URL as string | undefined);
const KV_TOKEN = (import.meta.env.KV_REST_API_TOKEN as string | undefined) || (import.meta.env.UPSTASH_REDIS_REST_TOKEN as string | undefined);

const SLUG_RE = /^week-\d{2}$/;
const keyFor = (slug: string) => `clauzibol:likes:${slug}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function kvCommand(args: string[]): Promise<unknown> {
  if (!KV_URL || !KV_TOKEN) throw new Error("kv-not-configured");
  const r = await fetch(KV_URL.replace(/\/$/, ""), {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`kv ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.result;
}

async function kvPipeline(commands: string[][]): Promise<unknown[]> {
  if (!KV_URL || !KV_TOKEN) throw new Error("kv-not-configured");
  const r = await fetch(`${KV_URL.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`kv ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data) ? data.map((d: { result: unknown }) => d.result) : [];
}

export const GET: APIRoute = async ({ url }) => {
  if (!KV_URL || !KV_TOKEN) {
    // Geen KV geconfigureerd: retourneer 0-counts ipv 500 zodat de UI gewoon werkt.
    const slug = url.searchParams.get("slug");
    const slugs = url.searchParams.get("slugs");
    if (slug) return json({ count: 0 });
    if (slugs) return json({ counts: Object.fromEntries(slugs.split(",").map((s) => [s, 0])) });
    return json({ counts: {} });
  }

  const single = url.searchParams.get("slug");
  if (single) {
    if (!SLUG_RE.test(single)) return json({ error: "invalid-slug" }, 400);
    try {
      const v = await kvCommand(["GET", keyFor(single)]);
      return json({ count: parseInt(String(v ?? "0"), 10) || 0 });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  const list = (url.searchParams.get("slugs") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SLUG_RE.test(s));
  if (list.length === 0) return json({ counts: {} });
  try {
    const results = await kvPipeline(list.map((s) => ["GET", keyFor(s)]));
    const counts: Record<string, number> = {};
    list.forEach((s, i) => {
      counts[s] = parseInt(String(results[i] ?? "0"), 10) || 0;
    });
    return json({ counts });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!KV_URL || !KV_TOKEN) return json({ error: "kv-not-configured" }, 503);
  let body: { slug?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  const slug = String(body.slug ?? "");
  const action = String(body.action ?? "like");
  if (!SLUG_RE.test(slug)) return json({ error: "invalid-slug" }, 400);
  if (action !== "like" && action !== "unlike") return json({ error: "invalid-action" }, 400);

  try {
    const key = keyFor(slug);
    let count: number;
    if (action === "like") {
      const v = await kvCommand(["INCR", key]);
      count = parseInt(String(v), 10) || 0;
    } else {
      const v = await kvCommand(["DECR", key]);
      count = parseInt(String(v), 10) || 0;
      if (count < 0) {
        await kvCommand(["SET", key, "0"]);
        count = 0;
      }
    }
    return json({ ok: true, count });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
