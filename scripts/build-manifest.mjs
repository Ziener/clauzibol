#!/usr/bin/env node
// Leest public/HASH-MANIFEST.txt en schrijft een gestructureerd manifest naar
// public/sealed/manifest.json (week → sha256), zodat de site er TypeScript-typed mee kan werken.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TXT = resolve(ROOT, "public/HASH-MANIFEST.txt");
const JSON_OUT = resolve(ROOT, "public/sealed/manifest.json");

const raw = await readFile(TXT, "utf8");
const entries = [];
for (const line of raw.split("\n")) {
  const m = line.match(/^([0-9a-f]{64})\s+week-(\d{2})-/i);
  if (!m) continue;
  entries.push({
    week: parseInt(m[2], 10),
    sha256: m[1].toLowerCase(),
    file: `week-${m[2]}.tlock`,
  });
}
entries.sort((a, b) => a.week - b.week);
const manifest = {
  chain: "drand-mainnet",
  hashAlgo: "sha256",
  sealedAt: "2026-04-20",
  publishedManifest: "/HASH-MANIFEST.txt",
  openTimestamps: "/HASH-MANIFEST.txt.ots",
  entries,
};
await writeFile(JSON_OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✓ ${entries.length} entries → ${JSON_OUT}`);
