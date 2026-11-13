#!/usr/bin/env bash
# verify-ios-e2e.sh — run the XCUITest suite against a CONNECTED iPhone/iPad.
#
# The Xcode project under `src-tauri/gen/apple` is generated (and gitignored), so
# the UI-test target and the scheme's test action are injected here from the
# tracked sources in `ios-e2e/`. That keeps the e2e code reviewable while the
# project stays a build artifact.
#
#   ./scripts/verify-ios-e2e.sh                       # connected device
#   ./scripts/verify-ios-e2e.sh --build               # rebuild the app first
#   UDID=00008101-... ./scripts/verify-ios-e2e.sh     # pick a device
#   ./scripts/verify-ios-e2e.sh --test test02_TabsRenderTheirViews
#   ./scripts/verify-ios-e2e.sh --dump                # print the a11y tree
#
# Prereqs: device plugged in + unlocked + 信任此电脑, a development profile for
# com.sendpalm.app that includes it, and `brew install xcodegen`.
set -euo pipefail

cd "$(dirname "$0")/.."

GEN="src-tauri/gen/apple"
PROJECT="$GEN/sendpalm-app.xcodeproj"
TEST_TARGET="sendpalm-app_iOSUITests"
APP_TARGET="sendpalm-app_iOS"
ONLY=""
BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) BUILD=1; shift ;;
    --test) ONLY="$2"; shift 2 ;;
    --dump) ONLY="test99_DumpAccessibilityTree"; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

if [[ "$BUILD" == "1" ]]; then
  echo "==> building the app for the device (debug)"
  pnpm exec tauri ios build --debug --target aarch64 --export-method debugging --ci
fi

LIB="$GEN/Externals/arm64/debug/libapp.a"
if [[ ! -f "$LIB" ]]; then
  echo "no Rust artifacts at $LIB — run './scripts/verify-ios-e2e.sh --build' first" >&2
  exit 1
fi

echo "==> injecting the UI test target"
mkdir -p "$GEN/UITests"
cp ios-e2e/SendPalmUITests.swift "$GEN/UITests/SendPalmUITests.swift"

python3 - "$GEN/project.yml" "$TEST_TARGET" "$APP_TARGET" <<'PY'
import sys

path, target, app_target = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()

if target in src:
    print("    target already present")
else:
    src = src.rstrip() + f"""

  {target}:
    type: bundle.ui-testing
    platform: iOS
    sources:
      - path: UITests
    dependencies:
      - target: {app_target}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.sendpalm.app.uitests
        TEST_TARGET_NAME: {app_target}
        DEVELOPMENT_TEAM: 5XNDF727Y6
        CODE_SIGN_STYLE: Automatic
        GENERATE_INFOPLIST_FILE: true
"""
    open(path, "w").write(src)
    print("    target added")

# `tauri ios build` deletes the CLI options file when it exits, and the Rust
# build phase of the generated project refuses to run without it (it is meant to
# be driven by the Tauri CLI). The test run reuses the libapp.a the last
# `tauri ios build` produced, so let that phase step aside when asked.
src = open(path).read()
if "SENDPALM_SKIP_RUST_BUILD" not in src:
    needle = """      - script: |
          pnpm tauri ios xcode-script"""
    if needle in src:
        src = src.replace(
            needle,
            """      - script: |
          if [ "${SENDPALM_SKIP_RUST_BUILD:-0}" = "1" ]; then
            echo "SENDPALM_SKIP_RUST_BUILD=1 — reusing the existing libapp.a"
            exit 0
          fi
          pnpm tauri ios xcode-script""",
            1,
        )
        open(path, "w").write(src)
        print("    Rust build phase made skippable for test runs")

# The generated scheme has no test action; without one `xcodebuild test` answers
# "Scheme ... is not currently configured for the test action".
src = open(path).read()
if "testTargets:" in src:
    print("    test action already wired")
else:
    anchor = """    scheme:
      environmentVariables:
        RUST_BACKTRACE: full
        RUST_LOG: info
    settings:
      base:
        ENABLE_BITCODE: false"""
    replacement = f"""    scheme:
      environmentVariables:
        RUST_BACKTRACE: full
        RUST_LOG: info
      testTargets:
        - {target}
    settings:
      base:
        ENABLE_BITCODE: false"""
    if anchor not in src:
        sys.exit("could not find the app scheme block to wire the test action into")
    open(path, "w").write(src.replace(anchor, replacement, 1))
    print("    test action wired into the scheme")
PY

echo "==> regenerating the Xcode project"
(cd "$GEN" && xcodegen generate >/dev/null)

if [[ -z "${UDID:-}" ]]; then
  UDID=$(xcrun devicectl list devices 2>/dev/null \
    | awk 'NR>1 && /iPhone|iPad/ && /(available|connected)/ {print $3; exit}')
fi
if [[ -z "${UDID:-}" ]]; then
  echo "no connected device:" >&2
  xcrun devicectl list devices 2>/dev/null | sed 's/^/    /' >&2
  exit 1
fi
if xcrun simctl list devices 2>/dev/null | grep -q "$UDID"; then
  DEST="platform=iOS Simulator,id=$UDID"
  echo "==> simulator $UDID"
  # The Rust build phase is skipped, so make sure the simulator artifacts exist.
  if [[ ! -f "$GEN/Externals/arm64/debug/libapp.a" ]]; then
    echo "no simulator libapp.a — run './scripts/verify-ios-e2e.sh --build' first" >&2
    exit 1
  fi
else
  DEST="id=$UDID"
  echo "==> device $UDID"
fi

# macOS bash 3.2 + `set -u`: an empty array expands as an unbound variable, so
# build the argument list without relying on array expansion of nothing.
if [[ -n "$ONLY" ]]; then
  set -- -only-testing:"$TEST_TARGET/$ONLY"
else
  set --
fi

RESULT="$PWD/$GEN/build/e2e-$(date +%Y%m%d-%H%M%S).xcresult"
mkdir -p "$(dirname "$RESULT")"

echo "==> xcodebuild test"
set +e
xcodebuild test \
  -project "$PROJECT" \
  -scheme "$APP_TARGET" \
  -destination "$DEST" \
  -derivedDataPath "$GEN/build/e2e-dd" \
  -resultBundlePath "$RESULT" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=5XNDF727Y6 \
  CODE_SIGN_STYLE=Automatic \
  SENDPALM_SKIP_RUST_BUILD=1 \
  "$@" \
  > /tmp/sendpalm-ios-e2e.log 2>&1
STATUS=$?
set -e

grep -E "Test Case|Test Suite|error:|\*\* TEST" /tmp/sendpalm-ios-e2e.log | tail -40 || true

if [[ -d "$RESULT" ]]; then
  echo "==> extracting screenshots"
  xcrun xcresulttool export attachments \
    --path "$RESULT" --output-path "$GEN/build/e2e-shots" >/dev/null 2>&1 || true
  ls "$GEN/build/e2e-shots" 2>/dev/null | head -10 || true
fi

echo "logs: /tmp/sendpalm-ios-e2e.log   result: $RESULT"
exit $STATUS
