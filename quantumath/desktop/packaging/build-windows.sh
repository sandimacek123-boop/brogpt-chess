#!/usr/bin/env bash
# Builds output/Quantumath-1.0.0-Setup.exe on Linux (or WSL/macOS with NSIS installed).
#   Needs: JDK 17+ for Gradle, python3, makensis (NSIS 3), unzip, tar, curl.
#   A minimal Windows Java runtime is created with jlink from the Windows JDK's jmods, using a Linux jlink of the
#   exact same version. Set WIN_JDK / LINUX_JDK to extracted JDK folders to skip the downloads.
set -euo pipefail
cd "$(dirname "$0")/../.."                     # quantumath/
ROOT=$PWD; PK=$ROOT/desktop/packaging; WORK=$ROOT/desktop/build/windows-pkg
JDK_RELEASE="${JDK_RELEASE:-jdk-21.0.13.1+2}"
MODULES=java.base,java.desktop,java.instrument,java.logging,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.accessibility
rm -rf "$WORK/stage"; mkdir -p "$WORK/stage/app" "$ROOT/output"

./gradlew :desktop:windowsJar --no-daemon -q
# drop the ~11,000 Material icons the app never references (79 MB → 41 MB)
python3 "$PK/strip_icons.py" desktop/build/windows/quantumath.jar "$WORK/stage/app/quantumath.jar"

enc=${JDK_RELEASE//+/%2B}
if [ -z "${WIN_JDK:-}" ]; then
  mkdir -p "$WORK/jdk-win"; curl -fsSL -o "$WORK/jdk-win.zip" "https://api.adoptium.net/v3/binary/version/$enc/windows/x64/jdk/hotspot/normal/eclipse"
  unzip -q -o "$WORK/jdk-win.zip" -d "$WORK/jdk-win"; WIN_JDK=$(echo "$WORK"/jdk-win/*/)
fi
if [ -z "${LINUX_JDK:-}" ]; then
  mkdir -p "$WORK/jdk-lin"; curl -fsSL -o "$WORK/jdk-lin.tgz" "https://api.adoptium.net/v3/binary/version/$enc/linux/x64/jdk/hotspot/normal/eclipse"
  tar xzf "$WORK/jdk-lin.tgz" -C "$WORK/jdk-lin"; LINUX_JDK=$(echo "$WORK"/jdk-lin/*/)
fi
# minimal runtime (~50 MB instead of ~146 MB); left uncompressed so the installer's LZMA compresses it better
"$LINUX_JDK/bin/jlink" --module-path "$WIN_JDK/jmods" --add-modules "$MODULES" --include-locales=en,sl,de,hr,it \
  --strip-debug --no-header-files --no-man-pages --compress=zip-0 --output "$WORK/stage/runtime"

makensis -V2 -DOUTFILE="$WORK/stage/Quantumath.exe" "$PK/launcher.nsi"
makensis -V2 -DSTAGE="$WORK/stage" -DOUTFILE="$ROOT/output/Quantumath-1.0.0-Setup.exe" "$PK/installer.nsi"
ls -la "$ROOT/output/Quantumath-1.0.0-Setup.exe"
