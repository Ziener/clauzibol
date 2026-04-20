# Clauzibol

> Plauzibele profetie van een AI met de Bijbel in de hand.

52 blogs, geschreven door Claude (AI) op **20 april 2026**, cryptografisch verzegeld via time-lock encryption (drand/tlock) en publiek vastgelegd op de Bitcoin-blockchain via OpenTimestamps. Elke maandag om 07:00 NL-tijd opent één slot. Niemand — ook de maker niet — kan eerder bij de tekst.

## Stack

- **Astro** (statische site, snel, SEO)
- **Tailwind CSS v4**
- **Hosting:** Vercel (gratis tier)
- **Domein/DNS:** Hostinger
- **Versleuteling:** drand/tlock + OpenTimestamps (nog te integreren in Fase 2)

## Lokaal draaien

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # output in ./dist
npm run preview      # serve ./dist lokaal
```

## Projectstructuur

```
src/
  layouts/Layout.astro        # header + footer + meta
  components/
    Tile.astro                # blog-tegel (open/verzegeld)
    Countdown.astro           # aftelklok
  data/weeks.ts               # 52 weken (slug, datum, hash, titel)
  pages/
    index.astro               # home + 52-grid
    manifest.astro
    over-claude.astro
    over-de-profetie.astro
    verificatie.astro
    archief.astro
    contact.astro
    faq.astro
    colofon.astro
    blog/[slug].astro         # dynamische blog-pagina (aftelklok of vrijgegeven tekst)
public/
  favicon.svg
```

## Roadmap (uit briefing)

- **Fase 1 — Site-skelet** ✓ (deze repo)
- **Fase 2 — Vergrendelingsinfra:** tlock-js integreren, hash-verificatie werkend, OpenTimestamps
- **Fase 3 — Content-inname:** 52 `.tlock` bestanden + hash-manifest plaatsen
- **Fase 4 — Live**

## Deploy naar Vercel

1. Push deze repo naar GitHub (publiek — transparantie is kernwaarde).
2. Op [vercel.com](https://vercel.com) → "Add new project" → kies de GitHub repo.
3. Framework wordt automatisch herkend als Astro. Build command: `npm run build`. Output: `dist`.
4. Deploy. Je krijgt een `*.vercel.app` URL.
5. Daarna in Vercel → Project → Settings → Domains → voeg `clauzibol.nl` en `www.clauzibol.nl` toe.
6. Vercel toont DNS-records die je bij Hostinger moet zetten:
   - `A` record voor `@` → `76.76.21.21`
   - `CNAME` record voor `www` → `cname.vercel-dns.com`
7. Bij Hostinger: hPanel → Domeinen → DNS Zone → bovenstaande records toevoegen.
8. SSL wordt automatisch geregeld (Let's Encrypt via Vercel).

## Licentie

Code: MIT. Blogteksten: CC-BY met bronvermelding (clauzibol.nl) + duidelijke vermelding dat het AI-tekst is.
