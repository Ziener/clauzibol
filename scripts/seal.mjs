#!/usr/bin/env node
// Verzegelt één blog: plaintext.md -> week-XX.tlock + hash in manifest, plaintext wordt vernietigd.
//
// Gebruik:
//   node scripts/seal.mjs <weekNummer> <pad-naar-plaintext.md>
//
// Voorbeeld:
//   node scripts/seal.mjs 7 blogs-plaintext/week-07.md
//
// Output:
//   - public/sealed/week-07.tlock        (versleutelde inhoud)
//   - public/sealed/manifest.json        (bijgewerkt met hash)
//   - blogs-plaintext/week-07.md         VERWIJDERD (overschreven met willekeurige bytes, dan unlinked)
//
// Gebruik --keep-plaintext om plaintext te bewaren (alleen voor lokaal testen).

import { readFile, writeFile, unlink, stat } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { timelockEncrypt, HttpChainClient, HttpCachingChain } from "tlock-js";

// Quicknet (League of Entropy) chain — komt overeen met scripts/unlock-times.mjs.
const QUICKNET_URL = "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const quicknetClient = () => new HttpChainClient(new HttpCachingChain(QUICKNET_URL));
import { unlockForWeek } from "./unlock-times.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEALED_DIR = join(ROOT, "public", "sealed");
const MANIFEST = join(SEALED_DIR, "manifest.json");

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes("--keep-plaintext");
  const positional = args.filter(a => !a.startsWith("--"));
  if (positional.length !== 2) {
    console.error("Gebruik: node scripts/seal.mjs <weekNummer 1-52> <plaintext.md> [--keep-plaintext]");
    process.exit(1);
  }
  const weekNumber = parseInt(positional[0], 10);
  const plainPath = resolve(positional[1]);

  const { iso, round } = unlockForWeek(weekNumber);
  console.log(`→ Week ${weekNumber}`);
  console.log(`  Unlock: ${iso}`);
  console.log(`  Drand round (quicknet): ${round}`);

  const plaintext = await readFile(plainPath);
  const hash = "sha256:" + createHash("sha256").update(plaintext).digest("hex");
  console.log(`  SHA-256: ${hash}`);

  console.log(`  Versleutelen via drand quicknet...`);
  const client = quicknetClient();
  const ciphertext = await timelockEncrypt(round, plaintext, client);

  const tlockName = `week-${String(weekNumber).padStart(2, "0")}.tlock`;
  const tlockPath = join(SEALED_DIR, tlockName);
  await writeFile(tlockPath, ciphertext);
  console.log(`  ✓ Geschreven: public/sealed/${tlockName}`);

  // Manifest updaten
  let manifest = { chain: "quicknet", entries: [] };
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {}
  manifest.entries = manifest.entries.filter(e => e.week !== weekNumber);
  manifest.entries.push({
    week: weekNumber,
    file: tlockName,
    unlockISO: iso,
    drandRound: round,
    sha256: hash,
    sealedAt: new Date().toISOString(),
  });
  manifest.entries.sort((a, b) => a.week - b.week);
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ✓ Manifest bijgewerkt`);

  // Plaintext vernietigen (overschrijven + unlinken)
  if (!keep) {
    const { size } = await stat(plainPath);
    await writeFile(plainPath, randomBytes(size));
    await unlink(plainPath);
    console.log(`  🔥 Plaintext vernietigd: ${plainPath}`);
  } else {
    console.log(`  ⚠️  --keep-plaintext: ${plainPath} blijft staan`);
  }
}

main().catch((err) => {
  console.error("FOUT:", err);
  process.exit(1);
});
