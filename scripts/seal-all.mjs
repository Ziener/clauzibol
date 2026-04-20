#!/usr/bin/env node
// Verzegelt alle 52 blogs in één keer.
// Verwacht bestanden in blogs-plaintext/week-01.md ... week-52.md
//
// Gebruik:
//   node scripts/seal-all.mjs                  # versleutelt alles wat er is, vernietigt plaintext
//   node scripts/seal-all.mjs --keep-plaintext # bewaart plaintext (alleen voor testen)

import { readdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PLAIN_DIR = join(ROOT, "blogs-plaintext");

const keep = process.argv.includes("--keep-plaintext");

const files = (await readdir(PLAIN_DIR))
  .filter(f => /^week-(\d{2})\.md$/.test(f))
  .sort();

if (files.length === 0) {
  console.log(`Geen blogs gevonden in ${PLAIN_DIR}`);
  process.exit(0);
}

console.log(`${files.length} blog(s) gevonden — versleutelen...\n`);

for (const f of files) {
  const week = parseInt(f.match(/^week-(\d{2})\.md$/)[1], 10);
  const args = ["scripts/seal.mjs", String(week), join(PLAIN_DIR, f)];
  if (keep) args.push("--keep-plaintext");
  const code = await new Promise((res) => {
    const p = spawn("node", args, { stdio: "inherit", cwd: ROOT });
    p.on("close", res);
  });
  if (code !== 0) {
    console.error(`✗ Week ${week} faalde — gestopt.`);
    process.exit(1);
  }
  console.log("");
}

console.log("✓ Klaar.");
