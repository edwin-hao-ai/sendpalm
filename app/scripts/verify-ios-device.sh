#!/usr/bin/env bash
# verify-ios-device.sh — install SendPalm on a CONNECTED iPhone/iPad, launch it,
# and capture a screenshot. The real-device twin of verify-ios.sh: the simulator
# can't tell you that the phone's keychain, notifications or WKWebView behave.
#
#   ./scripts/verify-ios-device.sh                  # reuse the last device build
#   ./scripts/verify-ios-device.sh --build          # build + install (~10 min)
#   UDID=00008101-... ./scripts/verify-ios-device.sh
#
# Prereqs: an unlocked device plugged in with "信任此电脑" accepted, a development
# provisioning profile for com.sendpalm.app that includes that device (Xcode
# creates it with -allowProvisioningUpdates), and libimobiledevice
# (`brew install libimobiledevice`) for idevicescreenshot.
set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLE_ID="com.sendpalm.app"
APP="src-tauri/gen/apple/build/arm64/SendPalm.app"
SHOTS="../docs/ios-screenshots"

if [[ "${1:-}" == "--build" ]]; then
  echo "==> building for the device (debug)"
  pnpm exec tauri ios build --debug --target aarch64 --export-method debugging --ci
fi

if [[ -z "${UDID:-}" ]]; then
  # devicectl prints paired devices even when they are offline; only a
  # "connected"/"available" state can take an install.
  UDID=$(xcrun devicectl list devices 2>/dev/null \
    | awk 'NR>1 && /iPhone|iPad/ && /(available|connected)/ {print $3; exit}')
fi
if [[ -z "${UDID:-}" ]]; then
  echo "no connected iPhone/iPad found." >&2
  echo "plug the device in, unlock it, tap 信任此电脑, then rerun." >&2
  xcrun devicectl list devices 2>/dev/null | sed 's/^/    /' >&2
  exit 1
fi
echo "==> device $UDID"

if [[ ! -d "$APP" ]]; then
  echo "no device build at $APP — run with --build first" >&2
  exit 1
fi

echo "==> install"
xcrun devicectl device install app --device "$UDID" "$APP"

echo "==> launch"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID" || true

sleep 8
mkdir -p "$SHOTS"
SHOT="$SHOTS/ios-device-$(date +%Y%m%d-%H%M%S).png"
if idevicescreenshot "$SHOT" 2>/dev/null; then
  echo "==> screenshot $SHOT"
else
  echo "==> screenshot failed (libimobiledevice not installed or device locked)" >&2
fi

echo "==> ok: installed and launched. Check the phone for the black-frame / login"
echo "    state; docs/ios-screenshots/ keeps the evidence."
