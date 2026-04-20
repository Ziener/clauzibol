// Bereken voor week N (1..52):
//   - unlock-tijd: maandag 07:00 Europe/Amsterdam, vanaf 2026-04-20
//   - drand round-nummer voor de quicknet beacon
//
// Quicknet (League of Entropy) — gebruikt door tlock-js standaard:
//   genesis_time = 1692803367  (unix seconds)
//   period       = 3 seconds
//   chain hash   = 52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971

const QUICKNET_GENESIS = 1692803367;
const QUICKNET_PERIOD = 3;

// Berekent unix-tijd (sec) voor 07:00 Europe/Amsterdam op een gegeven datum.
// Houdt rekening met zomertijd (CEST UTC+2) en wintertijd (CET UTC+1).
function amsterdam7amUnix(year, month0, day) {
  // Probeer UTC=05 (zou CEST zijn). Format de tijd terug naar Amsterdam.
  // Als de Amsterdam-tijd 07:00 is → CEST, klaar.
  // Anders gebruik UTC=06 (CET).
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const tryUtc = (h) => {
    const d = new Date(Date.UTC(year, month0, day, h, 0, 0));
    return { unix: d.getTime() / 1000, local: fmt.format(d) };
  };
  const a = tryUtc(5);
  if (a.local === "07:00") return a.unix;
  const b = tryUtc(6);
  if (b.local === "07:00") return b.unix;
  throw new Error(`Kan 07:00 Amsterdam niet vinden voor ${year}-${month0+1}-${day}`);
}

// Genereer 52 maandagen vanaf 2026-05-04 (lanceerdatum).
// Schrijfdatum is 20 april 2026; eerste publieke vrijgave 4 mei 2026 07:00 NL.
function mondayN(n) {
  const start = new Date(Date.UTC(2026, 4, 4)); // 4 mei 2026
  const d = new Date(start.getTime() + (n - 1) * 7 * 24 * 60 * 60 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}

export function unlockForWeek(weekNumber) {
  if (weekNumber < 1 || weekNumber > 52) {
    throw new Error(`weekNumber moet 1..52 zijn, kreeg ${weekNumber}`);
  }
  const { y, m, day } = mondayN(weekNumber);
  const unix = amsterdam7amUnix(y, m, day);
  const iso = new Date(unix * 1000).toISOString();
  const round = Math.floor((unix - QUICKNET_GENESIS) / QUICKNET_PERIOD) + 1;
  return { weekNumber, unix, iso, round };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("week | unlock UTC               | NL-tijd               | round");
  console.log("-----|--------------------------|-----------------------|----------");
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "short", timeStyle: "short",
  });
  for (let i = 1; i <= 52; i++) {
    const { iso, round, unix } = unlockForWeek(i);
    const nl = fmt.format(new Date(unix * 1000));
    console.log(`${String(i).padStart(4)} | ${iso} | ${nl.padEnd(21)} | ${round}`);
  }
}
