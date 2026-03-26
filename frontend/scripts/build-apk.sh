#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

echo "[1/3] Building web assets..."
npm run build

echo "[2/3] Syncing Capacitor Android project..."
npx cap sync android

echo "[3/3] Building Android release APK..."
cd android

if [[ -f "./gradlew" ]]; then
  ./gradlew assembleRelease
elif [[ -f "./gradlew.bat" ]]; then
  ./gradlew.bat assembleRelease
else
  echo "Could not find gradle wrapper in android/."
  exit 1
fi

echo "APK build finished. Output usually at:"
echo "android/app/build/outputs/apk/release/app-release.apk"
