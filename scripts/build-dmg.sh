#!/usr/bin/env bash
#
# build-dmg.sh — package SendPalm as a signed .dmg for distribution.
#
# Usage:
#   ./scripts/build-dmg.sh                # universal (arm64 + x86_64)
#   ./scripts/build-dmg.sh --arch arm64   # Apple Silicon only
#   ./scripts/build-dmg.sh --arch x86_64  # Intel only
#   ./scripts/build-dmg.sh --no-sign      # unsigned (local testing)
#
# Output:
#   dist/SendPalm-<version>-<arch>.dmg    # installable
#   dist/SendPalm.app                     # raw bundle (before .dmg)
#
# Requirements:
#   - macOS with Xcode + command line tools
#   - pnpm + node 20
#   - Apple Developer ID Application cert (for --sign; optional)
#   - create-dmg (brew install create-dmg) for nicer .dmg layout,
#     falls back to hdiutil if missing
#
# Code signing & notarisation:
#   - Without a Developer ID cert, the .dmg is unsigned. macOS will
#     warn users on first open. Fine for sideloading.
#   - With a Developer ID cert, we codesign + notarise via
#     notarytool. Set the env vars below. See "Apple notarisation"
#     at the bottom of this file for the one-time setup.
#
# This script does NOT publish anything. The .dmg ends up in dist/.

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
DIST_DIR="$ROOT_DIR/dist"

# Apple Developer identity for codesign + notarisation. Read from env
# so the script can be called from CI with secrets. Empty by default.
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_SIGN_IDENTITY="${APPLE_SIGN_IDENTITY:-}"      # e.g. "Developer ID Application: Foo (ABC123XYZ)"
NOTARY_KEYCHAIN_PROFILE="${NOTARY_KEYCHAIN_PROFILE:-}" # set up via `xcrun notarytool store-credentials`
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.sendpalm.app}"

# ── Argument parsing ──────────────────────────────────────────────
ARCH=""
SIGN=1
NOTARIZE=1

usage() {
  sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)      ARCH="$2"; shift 2 ;;
    --arch=*)    ARCH="${1#*=}"; shift ;;
    --no-sign)   SIGN=0; NOTARIZE=0; shift ;;
    --no-notarize) NOTARIZE=0; shift ;;
    -h|--help)   usage 0 ;;
    *)           echo "Unknown arg: $1" >&2; usage 1 ;;
  esac
done

if [[ -z "$ARCH" ]]; then
  # Default: universal (arm64 + x86_64). Tauri handles the lipo.
  ARCH="universal"
fi

# ── Preflight ─────────────────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: build-dmg.sh must be run on macOS" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found. Install with: npm i -g pnpm" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found" >&2
  exit 1
fi

if [[ "$SIGN" == "1" && -z "$APPLE_SIGN_IDENTITY" ]]; then
  echo "warn: APPLE_SIGN_IDENTITY not set; building unsigned .dmg" >&2
  echo "      (set it to your 'Developer ID Application: ...' identity)" >&2
  SIGN=0
  NOTARIZE=0
fi

if [[ "$NOTARIZE" == "1" && -z "$NOTARY_KEYCHAIN_PROFILE" ]]; then
  echo "warn: NOTARY_KEYCHAIN_PROFILE not set; skipping notarisation" >&2
  NOTARIZE=0
fi

# ── Version ───────────────────────────────────────────────────────
VERSION="$(grep -E '"version"' "$APP_DIR/package.json" | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')"
if [[ -z "$VERSION" ]]; then
  echo "error: could not read version from app/package.json" >&2
  exit 1
fi

DMG_NAME="SendPalm-${VERSION}-${ARCH}.dmg"
APP_NAME="SendPalm.app"
APP_PATH="$DIST_DIR/$APP_NAME"
DMG_PATH="$DIST_DIR/$DMG_NAME"

echo "→ SendPalm $VERSION · $ARCH"
echo "  output: $DMG_PATH"

# ── Build the .app bundle via Tauri ──────────────────────────────
echo
echo "→ Step 1/4: building .app bundle (this takes a while)"

cd "$APP_DIR"
TARGETS=()
case "$ARCH" in
  arm64)    TARGETS=("aarch64-apple-darwin") ;;
  x86_64)   TARGETS=("x86_64-apple-darwin") ;;
  universal) TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin") ;;
  *)        echo "error: unknown arch '$ARCH'" >&2; exit 1 ;;
esac

mkdir -p "$DIST_DIR"

# pnpm tauri build supports --target for a single target. For
# universal, build both then lipo via the `--target universal-apple-darwin`
# alias which Tauri 2 handles internally when the host is macOS 11+.
TAURI_TARGET_ARGS=()
for t in "${TARGETS[@]}"; do
  TAURI_TARGET_ARGS+=("--target" "$t")
done

pnpm tauri build "${TAURI_TARGET_ARGS[@]}"
# Tauri writes the .app under target/<triple>/release/bundle/macos/.
# Locate it.
BUILT_APP="$(find "$APP_DIR/src-tauri/target" -path "*/release/bundle/macos/$APP_NAME" -print -quit)"
if [[ -z "$BUILT_APP" ]]; then
  echo "error: Tauri did not produce $APP_NAME under src-tauri/target/" >&2
  exit 1
fi

# Copy to a stable dist path so subsequent steps can rely on it.
rm -rf "$APP_PATH"
cp -R "$BUILT_APP" "$APP_PATH"
echo "  built: $APP_PATH"

# ── Codesign ──────────────────────────────────────────────────────
echo
echo "→ Step 2/4: codesign"
if [[ "$SIGN" == "1" ]]; then
  echo "  signing with: $APPLE_SIGN_IDENTITY"
  codesign \
    --force \
    --deep \
    --options runtime \
    --timestamp \
    --sign "$APPLE_SIGN_IDENTITY" \
    "$APP_PATH"
  codesign --verify --verbose=2 "$APP_PATH"
else
  echo "  skipping (no APPLE_SIGN_IDENTITY)"
fi

# ── Build .dmg ────────────────────────────────────────────────────
echo
echo "→ Step 3/4: building $DMG_NAME"

# Use create-dmg if installed (nicer layout with a /Applications
# symlink); fall back to plain hdiutil.
if command -v create-dmg >/dev/null 2>&1; then
  echo "  using create-dmg"
  rm -f "$DMG_PATH"
  create-dmg \
    --volname "SendPalm" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "$APP_NAME" 175 200 \
    --hide-extension "$APP_NAME" \
    --app-drop-link 425 200 \
    --no-internet-enable \
    "$DMG_PATH" \
    "$APP_PATH"
else
  echo "  create-dmg not found; falling back to hdiutil (brew install create-dmg for nicer layout)"
  rm -f "$DMG_PATH"
  STAGING="$(mktemp -d)"
  ln -s /Applications "$STAGING/Applications"
  cp -R "$APP_PATH" "$STAGING/"
  hdiutil create \
    -volname "SendPalm" \
    -srcfolder "$STAGING" \
    -ov \
    -format UDZO \
    "$DMG_PATH"
  rm -rf "$STAGING"
fi

# ── Notarisation ──────────────────────────────────────────────────
echo
echo "→ Step 4/4: notarisation"
if [[ "$NOTARIZE" == "1" ]]; then
  echo "  submitting to Apple notary service via $NOTARY_KEYCHAIN_PROFILE"
  xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" \
    --wait
  echo "  stapling"
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
else
  echo "  skipping (no NOTARY_KEYCHAIN_PROFILE)"
fi

# ── Summary ───────────────────────────────────────────────────────
echo
echo "✓ Done."
ls -lh "$DMG_PATH"
echo
echo "Local install: open $DMG_PATH"
echo "Drag SendPalm.app to /Applications to install."

# ── Notes ─────────────────────────────────────────────────────────
# Apple notarisation one-time setup:
#
# 1. Create an app-specific password at https://appleid.apple.com
#    (App-Specific Passwords section).
# 2. Store credentials in your keychain:
#      xcrun notarytool store-credentials --apple-id "you@example.com" \
#        --team-id "$APPLE_TEAM_ID" \
#        --password "xxxx-xxxx-xxxx-xxxx"
#    This creates a profile name (you choose). Set NOTARY_KEYCHAIN_PROFILE
#    to that name.
# 3. Set APPLE_SIGN_IDENTITY to the exact string `codesign -s` expects.
#    `security find-identity -p codesigning` lists them.
# 4. To verify locally:
#      spctl --assess --type open --context context:primary-signature \
#        -v /Volumes/SendPalm/SendPalm.app
