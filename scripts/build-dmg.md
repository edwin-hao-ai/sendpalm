# Building the SendPalm macOS .dmg

`scripts/build-dmg.sh` packages the SendPalm desktop app as a distributable `.dmg` image. It runs only on macOS.

## Quick start

```bash
# Inside the repo root, on a Mac:
./scripts/build-dmg.sh

# → dist/SendPalm-0.1.0-universal.dmg
# → dist/SendPalm.app
```

The script produces an **unsigned** `.dmg` if you do not set up code signing. The `.dmg` works for local sideloading; macOS will warn on first open.

## Signed + notarised build

For a `.dmg` that opens without a Gatekeeper warning on someone else's Mac, you need an Apple Developer ID and to notarise the binary with Apple.

### One-time setup

1. **Join the Apple Developer Program** ($99 / year). <https://developer.apple.com/programs/enroll/>
2. **Create a Developer ID Application certificate** in <https://developer.apple.com/account/resources/certificates/list>. Download the cert and install it into your login keychain.
3. **Find the signing identity** string:
   ```bash
   security find-identity -p codesigning -v
   # e.g.  1. "Developer ID Application: Your Name (TEAMID1234)"
   ```
4. **Create an app-specific password** for your Apple ID at <https://appleid.apple.com/account/manage>. (Section "App-Specific Passwords".)
5. **Store notarytool credentials** in your keychain (run once):
   ```bash
   xcrun notarytool store-credentials \
     --apple-id "you@example.com" \
     --team-id "TEAMID1234" \
     --password "abcd-efgh-ijkl-mnop"
   ```
   You choose the profile name. Use it for `NOTARY_KEYCHAIN_PROFILE` below.

### Per-build environment

```bash
export APPLE_TEAM_ID="TEAMID1234"
export APPLE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID1234)"
export NOTARY_KEYCHAIN_PROFILE="sendpalm-notary"   # the name from step 5 above

./scripts/build-dmg.sh --arch arm64
# → dist/SendPalm-0.1.0-arm64.dmg
#   (signed, notarised, stapled, ready to ship)
```

### Verify after build

```bash
# Codesign valid?
codesign -dv --verbose=4 dist/SendPalm.app
spctl --assess --type open --context context:primary-signature -v dist/SendPalm.app

# Notarisation ticket stapled?
xcrun stapler validate dist/SendPalm-0.1.0-arm64.dmg
```

## Architecture

| Flag | Output | Use case |
|---|---|---|
| `--arch arm64` | arm64-only | Apple Silicon (M1/M2/M3) Macs |
| `--arch x86_64` | x86_64-only | Intel Macs |
| (no flag) | universal (arm64 + x86_64) | Everyone, ~70 MB larger |

The default universal build is what you ship. Single-arch builds are for testing the lipo'd binary or for stores that require a single arch (Mac App Store accepts universal).

## What the script does

1. **`pnpm tauri build --target <arch(es)>`** — builds the .app bundle.
2. **`codesign --force --deep --options runtime --timestamp`** — signs with the Developer ID cert, including the secure timestamp Apple requires.
3. **`.dmg` assembly** — uses `create-dmg` if installed (`brew install create-dmg`) for a nice layout with a `/Applications` symlink, otherwise falls back to a plain `hdiutil` image.
4. **`xcrun notarytool submit --wait`** — submits the .dmg to Apple's notary service, waits for the result, then **`xcrun stapler staple`** attaches the ticket to the file so it can be verified offline.

## Distribution

Once the `.dmg` is signed + notarised, you can:

- **Sideload** — upload to GitHub Releases. Users download and open it. No warning.
- **Setapp** — submit the `.dmg` to Setapp. They handle re-signing and distribution.
- **Mac App Store** — Mac App Store submission is **not** via a `.dmg`. You need to wrap the same `.app` in an `.pkg` and submit via App Store Connect with a `Mac App Store Distribution` certificate (different from the Developer ID cert). The script does not build the MAS package — use `pnpm tauri build --target universal-apple-darwin` then run `productbuild --component "dist/SendPalm.app" /Applications SendPalm.pkg` separately.

## See also

- [Apple: Notarising macOS software before distribution](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Apple: Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing_the_notarization_workflow)
- `tauri.conf.json` — the bundle identifier (`com.sendpalm.app`) and category are configured there
- [Apple: Human Interface Guidelines for macOS app icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
