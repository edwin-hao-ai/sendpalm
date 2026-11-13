#!/usr/bin/env bash
# ios-prepare.sh — put the tracked iOS bits into tauri's generated Xcode project.
#
# `src-tauri/gen/apple` is gitignored: `tauri ios init` regenerates it, and the
# entropy it ships with is wrong for a real app in two places:
#
#   1. the entitlements file is an empty <dict/>, so the app has no keychain
#      access group and `SecItemAdd` fails with -34018 — that is the
#      "添加邮箱之后会报错" state: account saved, password not, sync dead.
#   2. the project has no DEVELOPMENT_TEAM, so any `xcodegen generate` (tauri's
#      own init, or scripts/verify-ios-e2e.sh) makes the next build fail with
#      "Signing for sendpalm-app_iOS requires a development team".
#
# Idempotent. Call before `tauri ios build`.
set -euo pipefail

cd "$(dirname "$0")/.."

GEN="src-tauri/gen/apple"
TARGET="$GEN/sendpalm-app_iOS/sendpalm-app_iOS.entitlements"
TEAM="5XNDF727Y6"

mkdir -p "$(dirname "$TARGET")"
if ! cmp -s ios/entitlements.plist "$TARGET"; then
  cp ios/entitlements.plist "$TARGET"
  echo "==> installed keychain entitlements into $TARGET"
else
  echo "==> keychain entitlements already in place"
fi

python3 - "$GEN/project.yml" "$TEAM" <<'PY'
import sys

path, team = sys.argv[1], sys.argv[2]
src = open(path).read()

# xcodegen *writes* the entitlements file from `entitlements.properties`, so
# copying a file in is not enough — the properties are the source of truth and
# an empty list silently produced <dict/> again.
if "keychain-access-groups" not in src:
    anchor = "    entitlements:\n      path: sendpalm-app_iOS/sendpalm-app_iOS.entitlements"
    replacement = (
        "    entitlements:\n"
        "      path: sendpalm-app_iOS/sendpalm-app_iOS.entitlements\n"
        "      properties:\n"
        "        keychain-access-groups:\n"
        f"          - {team}.com.sendpalm.app"
    )
    if anchor in src:
        src = src.replace(anchor, replacement, 1)
        open(path, "w").write(src)
        print("==> declared keychain-access-groups in project.yml")
    else:
        print("!! could not find the entitlements block in project.yml", file=sys.stderr)

if "DEVELOPMENT_TEAM" in src:
    print("==> DEVELOPMENT_TEAM already pinned")
    sys.exit(0)

anchor = """      base:
        ENABLE_BITCODE: false"""
replacement = f"""      base:
        DEVELOPMENT_TEAM: {team}
        CODE_SIGN_STYLE: Automatic
        ENABLE_BITCODE: false"""
if anchor not in src:
    sys.exit("could not find the app target settings block in project.yml")
open(path, "w").write(src.replace(anchor, replacement, 1))
print("==> pinned DEVELOPMENT_TEAM in project.yml")
PY
