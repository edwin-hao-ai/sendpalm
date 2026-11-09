#!/usr/bin/env bash
# Build SendPalm for the iOS Simulator, install it, launch it and capture a
# screenshot. This is the loop that found the 2026-11-09 "black first frame":
# the app was exiting a second after launch, which a build-only check cannot
# see.
#
#   ./scripts/verify-ios.sh              # reuse the last build
#   ./scripts/verify-ios.sh --build      # rebuild first (~5 min incremental)
#   UDID=<sim-id> ./scripts/verify-ios.sh --build
#
# Prereqs: Xcode + an iOS simulator runtime, `rustup target add
# aarch64-apple-ios-sim`, and `pnpm install`.
set -euo pipefail

cd "$(dirname "$0")/.."

APP="src-tauri/gen/apple/build/arm64-sim/SendPalm.app"
BUNDLE_ID="com.sendpalm.app"
OUT_DIR="../docs/ios-screenshots"  # repo root, not app/
UDID="${UDID:-}"

if [[ "${1:-}" == "--build" ]]; then
  echo "==> building for the simulator"
  pnpm exec tauri ios build --debug --target aarch64-sim
fi

if [[ ! -d "$APP" ]]; then
  echo "no build at $APP — run with --build first" >&2
  exit 1
fi

if [[ -z "$UDID" ]]; then
  UDID=$(xcrun simctl list devices available \
    | grep -Eo 'iPhone [0-9]+[^()]*\(([0-9A-F-]{36})\)' \
    | head -1 | grep -Eo '[0-9A-F-]{36}')
fi
if [[ -z "$UDID" ]]; then
  echo "no iPhone simulator found" >&2
  exit 1
fi
echo "==> simulator $UDID"

xcrun simctl boot "$UDID" 2>/dev/null || true
open -a Simulator 2>/dev/null || true
# Wait for bootstatus so install does not race the boot.
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

echo "==> install"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"

echo "==> launch"
xcrun simctl launch "$UDID" "$BUNDLE_ID"
sleep 12

mkdir -p "$OUT_DIR"
SHOT="$OUT_DIR/ios-$(date +%Y%m%d-%H%M%S).png"
xcrun simctl io "$UDID" screenshot "$SHOT" >/dev/null 2>&1
echo "==> screenshot $SHOT"

# The failure mode this script exists for: the process starts and is gone a
# second later. Surface it instead of leaving a black screenshot to interpret.
if ! xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -q "$BUNDLE_ID"; then
  echo "WARNING: $BUNDLE_ID is not running — check the log:" >&2
  echo "  xcrun simctl spawn $UDID log show --last 2m --predicate 'process == \"SendPalm\"'" >&2
  exit 2
fi
echo "==> ok: process is alive"
