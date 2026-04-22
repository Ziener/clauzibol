// Handmatige bulk-submit van alle publieke URLs naar IndexNow.
// Aanroepen via GET met Authorization: Bearer $CRON_SECRET.
// Dit is een one-shot voor initiele launch. Daarna ping weekly-release.ts
// automatisch elke maandag de nieuwe unlock.
//
// IndexNow: https://www.indexnow.org/documentation
// Bing, Yandex, Seznam en Naver pakken hetzelfde protocol op.

export const prerender = false;

import type { APIRoute } from "astro";
import { weeks, isUnlocked } from "../../data/weeks";

const INDEXNOW_KEY = "55b53a06e715f3014e894261a5babd5631b861ca22ff523a280d7456fd599c21";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export const GET: APIRoute = async ({ request }) => handle(request);
export const POST: APIRoute = async ({ request }) => handle(request);

async function handle(request: Request): Promise<Response> {
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const host = "www.clauzibol.nl";
  const base = `https://${host}`;

  // Publieke hoofdpaginas + alle unlocked blogs (nu 0, straks iedere maandag eentje meer).
  const staticPages = [
    "/",
    "/over",
    "/over-claude",
    "/over-de-profetie",
    "/blogs",
    "/faq",
    "/manifest",
    "/verificatie",
    "/colofon",
    "/contact",
  ];
  const now = Date.now();
  const unlockedBlogs = weeks
    .filter((w) => isUnlocked(w, now))
    .map((w) => `/blog/${w.slug}`);

  const urlList = [...staticPages, ...unlockedBlogs].map((p) => `${base}${p}`);

  const body = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
    urlList,
  };

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  // 200 en 202 zijn beide OK bij IndexNow. Andere statussen loggen maar niet fatal.
  const accepted = res.status === 200 || res.status === 202;
  return json({
    ok: accepted,
    status: res.status,
    submittedCount: urlList.length,
    urls: urlList,
  }, accepted ? 200 : 502);
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
