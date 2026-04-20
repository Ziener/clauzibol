# Versleutelings-pipeline

## Wat dit doet

Neemt platte tekst in (markdown), berekent SHA-256, versleutelt via **drand quicknet time-lock encryption** voor de unlock-datum van die week, schrijft `week-XX.tlock` naar `public/sealed/`, voegt de hash toe aan `public/sealed/manifest.json`, en **vernietigt de plaintext** (overschrijft met willekeurige bytes en unlinkt het bestand).

Vanaf dat moment kan **niemand** — jij niet, ik niet, Vercel niet, Anthropic niet — bij de inhoud, totdat het drand-netwerk de sleutel voor die round publiceert (= maandag 07:00 NL-tijd, week N).

## Mappen

```
blogs-plaintext/        # tijdelijk: hier zet je week-01.md ... week-52.md
                        # in .gitignore — komt nooit in repo
public/sealed/          # output: week-01.tlock ... week-52.tlock + manifest.json
                        # WEL in repo — publieke versleutelde bestanden
```

## Workflow

### 1. Schrijf één blog
Sla op als `blogs-plaintext/week-07.md` (markdown, vrije vorm).

### 2. Verzegel
```bash
node scripts/seal.mjs 7 blogs-plaintext/week-07.md
```
Output:
- `public/sealed/week-07.tlock` aangemaakt
- `public/sealed/manifest.json` bijgewerkt met `{ week, file, unlockISO, drandRound, sha256 }`
- `blogs-plaintext/week-07.md` **vernietigd**

### 3. Of in batch (na alle 52 schrijven)
```bash
node scripts/seal-all.mjs
```
Versleutelt alles in `blogs-plaintext/`, vernietigt elke plaintext na succes.

### 4. Commit & push
```bash
git add public/sealed
git commit -m "Seal week 07 (sha256: ...)"
git push
```

## Belangrijke flags

- `--keep-plaintext` — bewaart de plaintext na versleuteling. **Alleen voor lokaal testen.** Standaard niet doen.

## Unlock-tabel inzien

```bash
node scripts/unlock-times.mjs
```
Print 52 regels met unlock-datum (UTC) en drand round-nummer.

## Verificatie

Elk `.tlock` bestand kan vanaf zijn unlock-tijd door iedereen worden ontsleuteld via:
- de `tlock-js` library
- de officiële drand `tlock` CLI
- of via https://timevault.drand.love/

De SHA-256 in het manifest moet exact overeenkomen met de SHA-256 van de ontsleutelde plaintext. Als die afwijkt: er is gerommeld.

## Tegen welke chain

`drand quicknet` (League of Entropy mainnet, unchained, 3-seconde periode). Reden: snel, breed gedragen, geen chained-signature swap-risico.

Genesis: 1692803367 (unix). Period: 3s. Chain hash: `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`.
