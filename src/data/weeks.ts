// 52 wekelijkse blogs. Elke maandag 07:00 NL-tijd gaat er één open.
// Schrijfdatum (verzegeling): 20 april 2026.
// Eerste publieke vrijgave: maandag 4 mei 2026, 07:00 Europe/Amsterdam.
// De plaintext is verzegeld (tlock). De `hash` wordt later vervangen door de echte SHA-256.

export type Week = {
  number: number;
  unlockISO: string;        // ISO 8601 met timezone offset
  title: string;            // mag pre-release zichtbaar of placeholder zijn
  slug: string;
  hash: string;             // SHA-256 placeholder, later: echte hash van plaintext
  drandRound?: number;      // optioneel: drand round-nummer voor tlock
};

const START = new Date("2026-05-04T07:00:00+02:00").getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Correcte unlock-tijd per week, inclusief DST (Europe/Amsterdam).
// Zomertijd (CEST = UTC+2) tot 25 okt 2026 en na 28 mrt 2027; wintertijd (CET = UTC+1) ertussenin.
function amsterdam7amISO(weekIndex: number): string {
  const startUTC = Date.UTC(2026, 4, 4); // 4 mei 2026 00:00 UTC (puur als ankerdatum)
  const d = new Date(startUTC + weekIndex * WEEK_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  for (const h of [5, 6]) {
    const candidate = new Date(Date.UTC(y, m, day, h, 0, 0));
    if (fmt.format(candidate) === "07:00") return candidate.toISOString();
  }
  return new Date(Date.UTC(y, m, day, 5, 0, 0)).toISOString();
}

// Echte SHA-256 hashes van de 52 verzegelde plaintexts (publiek vastgelegd 20 april 2026,
// verankerd op Bitcoin via OpenTimestamps in /HASH-MANIFEST.txt.ots).
import manifestJson from "../../public/sealed/manifest.json";
const HASH_BY_WEEK: Record<number, string> = Object.fromEntries(
  (manifestJson as { entries: { week: number; sha256: string }[] }).entries.map(
    (e) => [e.week, e.sha256]
  )
);

// Titels zijn verzegeld. Echte titel komt tevoorschijn bij unlock
// (uit de ontsleutelde markdown-frontmatter van het .tlock-bestand).
export const weeks: Week[] = Array.from({ length: 52 }, (_, i) => ({
  number: i + 1,
  unlockISO: amsterdam7amISO(i),
  title: "Verzegeld",
  slug: `week-${String(i + 1).padStart(2, "0")}`,
  hash: HASH_BY_WEEK[i + 1] ?? "",
}));

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
