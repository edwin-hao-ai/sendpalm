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
LOG_DIR="/tmp/sendpalm-ios"
LOG_FILE="$LOG_DIR/verify-ios.log"

# Default device. Pass any other name as the first argument.
DEVICE="${1:-iPhone 17}"

mkdir -p "$SCREENSHOT_DIR" "$LOG_DIR"

echo "▶ verifying Xcode toolchain"
xcodebuild -version >/dev/null

echo "▶ verifying rust ios-sim target"
rustup target list --installed | grep -q aarch64-apple-ios-sim \
  || rustup target add aarch64-apple-ios-sim

echo "▶ loading test credentials for real-account sync"
if [ -f "$APP/.env" ]; then
  # shellcheck source=/dev/null
  set -a
  . "$APP/.env"
  set +a
  # simctl forwards caller env vars prefixed with SIMCTL_CHILD_ to the app.
  export SIMCTL_CHILD_SENDPALM_TEST_EMAIL="${SENDPALM_TEST_EMAIL:-}"
  export SIMCTL_CHILD_SENDPALM_TEST_PASSWORD="${SENDPALM_TEST_PASSWORD:-}"
  export SIMCTL_CHILD_SENDPALM_TEST_IMAP_HOST="${SENDPALM_TEST_IMAP_HOST:-imap.feishu.cn}"
  export SIMCTL_CHILD_SENDPALM_TEST_IMAP_PORT="${SENDPALM_TEST_IMAP_PORT:-993}"
  export SIMCTL_CHILD_SENDPALM_TEST_SMTP_HOST="${SENDPALM_TEST_SMTP_HOST:-smtp.feishu.cn}"
  export SIMCTL_CHILD_SENDPALM_TEST_SMTP_PORT="${SENDPALM_TEST_SMTP_PORT:-465}"
  echo "  email:    ${SENDPALM_TEST_EMAIL:-<not set>}"
else
  echo "⚠️  $APP/.env not found; iOS sync will fall back to empty states"
fi

echo "▶ booting simulator: $DEVICE"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
# Give the simulator a moment to finish booting.
xcrun simctl bootstatus "$DEVICE" -b 2>/dev/null || true

echo "▶ cleaning previous iOS build artifacts"
rm -rf "$GEN/build"

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

# Remove any persisted state from previous runs so onboarding/sync start fresh.
xcrun simctl terminate booted com.sendpalm.app 2>/dev/null || true
rm -rf "$HOME/Library/Developer/CoreSimulator/Devices"/*/data/Containers/Data/Application/*/Library/Application\ Support/com.sendpalm.app 2>/dev/null || true

echo "▶ launching app with real-account env vars"
rm -f "$LOG_FILE"
# --stdout/--stderr redirect app logs to a file and return immediately.
xcrun simctl launch \
  --stdout="$LOG_FILE" \
  --stderr="$LOG_FILE" \
  booted com.sendpalm.app

slug="$(echo "$DEVICE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"

# Screenshot 1: splash / first paint.
sleep 4
xcrun simctl io booted screenshot "$SCREENSHOT_DIR/${slug}-01-launch.png"

# Screenshot 2: shell ready (onboarding auto-completed).
sleep 5
xcrun simctl io booted screenshot "$SCREENSHOT_DIR/${slug}-02-ready.png"

# Screenshot 3: after the first IMAP sync tick has had time to backfill.
echo "▶ waiting for first IMAP sync tick (up to 30s)"
sleep 15
xcrun simctl io booted screenshot "$SCREENSHOT_DIR/${slug}-03-syncing.png"

# Screenshot 4: a bit more backfill / populated list.
sleep 15
xcrun simctl io booted screenshot "$SCREENSHOT_DIR/${slug}-04-populated.png"

echo "▶ done"
echo "  bundle:   $BUNDLE"
echo "  shots:    $SCREENSHOT_DIR"
echo "  log:      $LOG_FILE"