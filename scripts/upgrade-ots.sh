#!/bin/bash
# Voert ~24u na de initiële stamp ots upgrade uit, verankert het bewijs in een Bitcoin-block,
# kopieert het bijgewerkte .ots naar de site-repo, commit en pushet naar GitHub.
# Self-disables na succes door zijn eigen LaunchAgent te unloaden + plist te verwijderen.

set -euo pipefail

PATH=/usr/local/bin:/opt/homebrew/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin:/usr/bin:/bin:$PATH

PROJECT_DIR="/Users/robgiesbers/Christelijk project blog"
SITE_DIR="/Users/robgiesbers/clauzibol"
LOG="$SITE_DIR/scripts/upgrade-ots.log"
PLIST="$HOME/Library/LaunchAgents/nl.clauzibol.ots-upgrade.plist"

exec >>"$LOG" 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') — start upgrade ====="

cd "$PROJECT_DIR"

# Backup huidige .ots zodat we kunnen vergelijken of er echt is geupgrade
cp HASH-MANIFEST.txt.ots HASH-MANIFEST.txt.ots.before-upgrade

if ! ots upgrade HASH-MANIFEST.txt.ots; then
  echo "⚠️  ots upgrade gaf non-zero exit. Mogelijk nog niet geconfirmeerd in een block — opnieuw proberen morgen via reschedule."
  # Reschedule voor +24u door dezelfde plist met nieuwe StartCalendarInterval te schrijven
  TARGET=$(date -v+24H '+%Y-%m-%d %H:%M')
  echo "Reschedule naar $TARGET"
  YEAR=$(date -v+24H '+%Y')
  MONTH=$(date -v+24H '+%-m')
  DAY=$(date -v+24H '+%-d')
  HOUR=$(date -v+24H '+%-H')
  MIN=$(date -v+24H '+%-M')
  launchctl unload "$PLIST" 2>/dev/null || true
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>nl.clauzibol.ots-upgrade</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SITE_DIR/scripts/upgrade-ots.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Year</key><integer>$YEAR</integer>
    <key>Month</key><integer>$MONTH</integer>
    <key>Day</key><integer>$DAY</integer>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MIN</integer>
  </dict>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST
  launchctl load "$PLIST"
  exit 0
fi

# Check of het bestand daadwerkelijk is veranderd
if cmp -s HASH-MANIFEST.txt.ots HASH-MANIFEST.txt.ots.before-upgrade; then
  echo "ℹ️  .ots ongewijzigd — calendar nog niet in een block geattest. Reschedule +24u."
  rm HASH-MANIFEST.txt.ots.before-upgrade
  TARGET=$(date -v+24H '+%Y-%m-%d %H:%M')
  echo "Reschedule naar $TARGET"
  YEAR=$(date -v+24H '+%Y'); MONTH=$(date -v+24H '+%-m'); DAY=$(date -v+24H '+%-d'); HOUR=$(date -v+24H '+%-H'); MIN=$(date -v+24H '+%-M')
  launchctl unload "$PLIST" 2>/dev/null || true
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>nl.clauzibol.ots-upgrade</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SITE_DIR/scripts/upgrade-ots.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Year</key><integer>$YEAR</integer><key>Month</key><integer>$MONTH</integer>
    <key>Day</key><integer>$DAY</integer><key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MIN</integer>
  </dict>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST
  launchctl load "$PLIST"
  exit 0
fi

echo "✓ .ots is geupgrade — Bitcoin-blockattest aanwezig."
rm HASH-MANIFEST.txt.ots.before-upgrade

# Kopieer naar site-repo
cp HASH-MANIFEST.txt.ots "$SITE_DIR/public/HASH-MANIFEST.txt.ots"

cd "$SITE_DIR"
git add public/HASH-MANIFEST.txt.ots
if git diff --cached --quiet; then
  echo "ℹ️  Geen wijziging in repo .ots — niets te committen."
else
  git -c user.email="info@clauzibol.nl" -c user.name="Rob" commit -m "Upgrade OpenTimestamps proof with Bitcoin block confirmation"
  git push
  echo "✓ Gepusht naar GitHub."
fi

# Self-disable: dit is een one-shot taak die nu klaar is.
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "✓ LaunchAgent unloaded en plist verwijderd. Taak voltooid."
