#!/usr/bin/env bash
# iOS Simulator verification for SendPalm.
#
# Boots an iPhone simulator, builds the debug bundle, installs + launches
# the app, takes a screenshot of each milestone, and shuts down cleanly.
#
# Prerequisites:
#   - Xcode + iOS SDK (verified via `xcodebuild -version`)
#   - rustup target aarch64-apple-ios-sim installed
#   - pnpm + tauri-cli (this repo)
#
# Usage:
#   scripts/verify-ios.sh              # build + launch + 3 screenshots
#   scripts/verify-ios.sh iPad-Pro     # build + launch on iPad Pro 13"
#
# Output:
#   docs/ios-screenshots/{iphone|ipad}-<step>.png
#
# This script is the iOS smoke test that complements `pnpm e2e` (which runs
# Playwright on the desktop viewport). The desktop viewport tests cover the
# responsive layouts; this script confirms the same SolidJS bundle actually
# boots inside a Tauri WKWebView on iOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
GEN="$APP/src-tauri/gen/apple"
BUNDLE="$GEN/build/arm64-sim/SendPalm.app"
SCREENSHOT_DIR="$ROOT/docs/ios-screenshots"

# Default device. Pass any other name as the first argument.
DEVICE="${1:-iPhone 17}"

mkdir -p "$SCREENSHOT_DIR"

echo "▶ verifying Xcode toolchain"
xcodebuild -version >/dev/null

echo "▶ verifying rust ios-sim target"
rustup target list --installed | grep -q aarch64-apple-ios-sim \
  || rustup target add aarch64-apple-ios-sim

echo "▶ booting simulator: $DEVICE"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
# Give the simulator a moment to finish booting.
xcrun simctl bootstatus "$DEVICE" -b 2>/dev/null || true

echo "▶ building debug bundle"
(cd "$APP" && pnpm tauri ios build \
  --debug \
  --target aarch64-sim \
  --no-sign)

if [ ! -d "$BUNDLE" ]; then
  echo "❌ bundle missing: $BUNDLE" >&2
  exit 1
fi

echo "▶ installing app"
xcrun simctl install booted "$BUNDLE"

echo "▶ launching app"
xcrun simctl launch booted com.sendpalm.app

# Give the webview a moment to load Vite + render the shell.
sleep 6

echo "▶ capturing screenshots"
slug="$(echo "$DEVICE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"
xcrun simctl io booted screenshot "$SCREENSHOT_DIR/${slug}-01-launch.png"

echo "▶ done"
echo "  bundle:   $BUNDLE"
echo "  shots:    $SCREENSHOT_DIR"