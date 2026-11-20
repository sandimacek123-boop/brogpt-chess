#!/usr/bin/env bash
# Builds output/Quantumath-1.0.0-Setup.exe on Linux (or WSL/macOS with NSIS installed).
#   Needs: JDK 17+ for Gradle, makensis (NSIS 3), unzip, curl.
#   JRE_ZIP may point to a Windows x64 JRE 21 zip; otherwise Temurin 21 is downloaded from api.adoptium.net.
set -euo pipefail
cd "$(dirname "$0")/../.."                     # quantumath/
ROOT=$PWD; PK=$ROOT/desktop/packaging; WORK=$ROOT/desktop/build/windows-pkg
rm -rf "$WORK"; mkdir -p "$WORK/stage/app" "$ROOT/output"
./gradlew :desktop:windowsJar --no-daemon -q
cp desktop/build/windows/quantumath.jar "$WORK/stage/app/"
if [ -z "${JRE_ZIP:-}" ]; then
  JRE_ZIP=$WORK/jre.zip
  curl -fsSL -o "$JRE_ZIP" "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse"
fi
mkdir -p "$WORK/jre"; unzip -q "$JRE_ZIP" -d "$WORK/jre"
mv "$WORK/jre"/*/ "$WORK/stage/runtime"
makensis -V2 -DOUTFILE="$WORK/stage/Quantumath.exe" "$PK/launcher.nsi"
makensis -V2 -DSTAGE="$WORK/stage" -DOUTFILE="$ROOT/output/Quantumath-1.0.0-Setup.exe" "$PK/installer.nsi"
ls -la "$ROOT/output/Quantumath-1.0.0-Setup.exe"
