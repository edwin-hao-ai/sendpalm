# SendPalm

A calm, HEY-inspired email + calendar + IM + Agent workspace built with Tauri 2,
SolidJS, and Rust.

Targets: macOS / Windows / Linux desktop, plus iPhone + iPad via Tauri 2 mobile.

## Quickstart

```bash
pnpm install
pnpm tauri dev               # desktop dev with hot reload
scripts/verify-ios.sh        # build + boot + screenshot on iPhone Simulator
```

## Brand

- Logo: `src/assets/logo.svg` (full plate) + `src/assets/logo-mark.svg` (compact)
- Wordmark: `src/assets/logo-wordmark.svg`
- Favicon: `src/assets/favicon.svg`
- Tauri bundle icons: regenerate with `pnpm tauri icon /path/to/1024x1024.png`
- Splash screen: declared inline in `index.html` so it renders before JS loads

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
