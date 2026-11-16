#!/usr/bin/env bash
# Downloads REAL's official, publicly served brand assets from projectreal.gg.
# These belong to the REAL / Project Real team and are only used here for a fan promo edit.
set -euo pipefail
cd "$(dirname "$0")/../assets/official"
BASE=https://projectreal.gg
get() { curl -fsSL -m 60 -A "Mozilla/5.0" -o "$2" "$BASE/$1"; echo "ok  $2"; }
get assets/real-logo.svg                                  real-logo.svg
get _astro/app-editor-window.jQG0DFfG_1sTNsa.webp         app-editor-window.webp
get _astro/hero-editor.Dp09rGub_ZBev0d.webp               hero-editor.webp
get _astro/script-hub-showcase.D8OU3BVl_NpzFy.webp        script-hub-showcase.webp
get _astro/account-manager-codex.C7Db7ex__Z2sSAf9.webp    account-manager.webp
get _astro/background-wave.B_T0GuVy_1dB6sJ.webp           background-wave.webp
