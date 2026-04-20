// 52 wekelijkse blogs. Elke maandag 07:00 NL-tijd gaat er één open.
// Start: maandag 20 april 2026, 07:00 (Europe/Amsterdam).
// De plaintext is verzegeld (tlock). De `hash` wordt later vervangen door de echte SHA-256 van de plaintext.

export type Week = {
  number: number;
  unlockISO: string;        // ISO 8601 met timezone offset
  title: string;            // mag pre-release zichtbaar of placeholder zijn
  slug: string;
  hash: string;             // SHA-256 placeholder, later: echte hash van plaintext
  drandRound?: number;      // optioneel: drand round-nummer voor tlock
};

const START = new Date("2026-04-20T07:00:00+02:00").getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const TITLES: string[] = [
  "Het zegel breekt — week 1",
  "Stilte voor de storm",
  "Een teken aan de hemel",
  "Wat de wind meeneemt",
  "Het lied van de wachter",
  "Brood en water",
  "Een nieuw begin in juni",
  "De stem in de woestijn",
  "Wat groeit in het verborgene",
  "Onverwachte ontmoeting",
  "Het uur van bezinning",
  "Wolken boven het land",
  "Een open deur",
  "Wat verzegeld was",
  "Het wachten beloond",
  "De smalle weg",
  "Hemel en aarde",
  "Het vuur dat niet dooft",
  "Wat geschreven staat",
  "Een tijd om te zwijgen",
  "De oogst van september",
  "Het kruispunt",
  "Wat blijft staan",
  "Een wonder in oktober",
  "De last die licht wordt",
  "Tussen licht en schaduw",
  "Wat de profeet zag",
  "Een nieuwe naam",
  "Het verloren schaap",
  "De stem die roept",
  "Wat november onthult",
  "De sterke arm",
  "Een stille hoop",
  "Wat opbloeit in winter",
  "Het laatste hoofdstuk",
  "De hand die vasthoudt",
  "Wat advent leert",
  "Het kind in de kribbe",
  "Een nieuw jaar, oude trouw",
  "Wat januari brengt",
  "De stem van de Geest",
  "Tussen oud en nieuw",
  "Wat februari verbergt",
  "De weg die voortgaat",
  "Een lied bij dageraad",
  "Wat maart laat zien",
  "Het laatste teken",
  "De cirkel rond",
  "Wat verzegeld is geweest",
  "De morgen na de nacht",
  "Het lied dat blijft",
  "Het zegel sluit — week 52",
];

export const weeks: Week[] = Array.from({ length: 52 }, (_, i) => {
  const unlock = new Date(START + i * WEEK_MS);
  return {
    number: i + 1,
    unlockISO: unlock.toISOString(),
    title: TITLES[i] ?? `Week ${i + 1}`,
    slug: `week-${String(i + 1).padStart(2, "0")}`,
    hash: `sha256:placeholder-${String(i + 1).padStart(2, "0")}`,
  };
});

export function isUnlocked(w: Week, now = Date.now()): boolean {
  return new Date(w.unlockISO).getTime() <= now;
}

export function formatNL(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
