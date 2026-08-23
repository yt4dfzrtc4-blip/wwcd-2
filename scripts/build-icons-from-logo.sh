#!/bin/bash
set -euo pipefail

# Génère toutes les icônes PWA à partir de public/logo-source.png
# Usage : ./scripts/build-icons-from-logo.sh

cd "$(dirname "$0")/.."

SRC="public/logo-source.png"
BG="f1e2bd" # couleur de fond du logo, échantillonnée depuis logo-source.png
OUT="public/icons"

mkdir -p "$OUT"

# Icônes "any" (plein cadre)
sips -Z 512 "$SRC" --out "$OUT/icon-512.png" >/dev/null
sips -Z 192 "$SRC" --out "$OUT/icon-192.png" >/dev/null
sips -Z 180 "$SRC" --out public/apple-touch-icon.png >/dev/null

# Icônes "maskable" (zone de sécurité ~70% pour survivre au masque circulaire Android)
sips -Z 358 "$SRC" --out /tmp/wwcd-logo-358.png >/dev/null
sips -p 512 512 --padColor "$BG" /tmp/wwcd-logo-358.png --out "$OUT/icon-512-maskable.png" >/dev/null

sips -Z 134 "$SRC" --out /tmp/wwcd-logo-134.png >/dev/null
sips -p 192 192 --padColor "$BG" /tmp/wwcd-logo-134.png --out "$OUT/icon-192-maskable.png" >/dev/null

rm -f /tmp/wwcd-logo-358.png /tmp/wwcd-logo-134.png

echo "Icônes générées à partir de $SRC"
