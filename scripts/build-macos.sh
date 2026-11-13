#!/usr/bin/env bash
# build-macos.sh — build the macOS app and sign it the way notifications and
# the keychain need.
#
# Why signing is not optional here:
#   * `tauri build` produces an ad-hoc/linker-signed bundle
#     (`Identifier=sendpalm_app-<hash>`, `Info.plist=not bound`). macOS refuses
#     to register such a bundle with the notification centre, so
#     `requestAuthorization` answers `false` without ever showing a dialog and
#     every banner is dropped silently.
#   * The mail password lives in the login keychain, and the ACL is bound to the
#     code signature. A consistently signed app keeps reading the entry that a
#     previous build wrote; ad-hoc builds lose it on every rebuild.
#
# Usage:
#   ./scripts/build-macos.sh             # release build, signed, installed
#   ./scripts/build-macos.sh --no-install
#
# Env: SENDPALM_SIGN_IDENTITY overrides the identity below.
set -euo pipefail

cd "$(dirname "$0")/../app"

IDENTITY="${SENDPALM_SIGN_IDENTITY:-Developer ID Application: Beijing VGO Co;Ltd (5XNDF727Y6)}"
BUNDLE=com.sendpalm.app
APP="$HOME/.cargo/shared-target/release/bundle/macos/SendPalm.app"
INSTALL=1
[[ "${1:-}" == "--no-install" ]] && INSTALL=0

echo "==> building (release)"
pnpm tauri build --bundles app

echo "==> signing as: $IDENTITY"
codesign --force --sign "$IDENTITY" --identifier "$BUNDLE" "$APP"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|TeamIdentifier|Authority" | sed 's/^/    /'

if [[ "$INSTALL" == "1" ]]; then
  echo "==> installing to /Applications"
  pkill -x sendpalm-app 2>/dev/null || true
  rm -rf /Applications/SendPalm.app
  ditto "$APP" /Applications/SendPalm.app
  open -a /Applications/SendPalm.app
  echo "    installed. First launch after a signature change:"
  echo "    open the app once, Settings → 账户 → 重新输入邮箱密码 (the keychain"
  echo "    entry is bound to the old signature)."
fi
