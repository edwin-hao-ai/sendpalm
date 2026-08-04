# Lessons learned

Detailed explanations for the recurring traps captured in [AGENTS.md §11](../AGENTS.md).
Read this when you hit an unfamiliar symptom; the table of contents is the diagnostic index.

---

## Animations

### What to animate

Always animate `transform` (and `opacity`). Never animate `top` / `bottom` / `left` / `right` /
`width` / `height` — those trigger layout reflows on every frame and stutter on lower-end
hardware. `transform` runs on the GPU compositor and stays at 60fps even when the JS thread
is busy.

```css
/* ❌ re-flows layout every frame */
.box { transition: top 0.2s ease-out; top: 0; }
.box.open { top: 100px; }

/* ✅ GPU-composited, smooth */
.box { transition: transform 0.2s ease-out; transform: translateY(0); }
.box.open { transform: translateY(100px); }
```

### Spring physics

`easeOutBack` (cubic-bezier control points past 1.0) gives the iOS-like "settle into place"
feel. Two values we've used:

| Use | cubic-bezier |
|---|---|
| Modal / panel enter | `cubic-bezier(0.34, 1.56, 0.64, 1)` — stronger overshoot |
| Spring snap after a pull gesture | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` — gentler overshoot |

Pure `ease-in-out` feels mechanical; `ease-out` feels passive. Reach for `easeOutBack` whenever
something is entering the screen or responding to a user gesture.

### Replaying a CSS animation on prop change

SolidJS does not re-apply a `style.animation` change if the string is identical to the previous
value. To replay an enter animation when the underlying state changes (e.g., switching between
messages), force a reflow:

```ts
let heroEl: HTMLDivElement | undefined;
createEffect(() => {
  // tracking the prop we care about…
  props.messageId;

  queueMicrotask(() => {
    // reset + reflow + reapply
    if (heroEl) {
      heroEl.style.animation = "none";
      void heroEl.offsetHeight; // force reflow
      heroEl.style.animation = "message-detail-enter 0.28s var(--ease-out) both";
    }
  });
});
```

The `void heroEl.offsetHeight` line is the magic — reading layout dimensions forces the browser
to apply the `animation: none` reset before we set the new animation, so the keyframes replay.

---

## Long unbroken strings (URLs)

Anywhere a paragraph might contain a mailto:, https URL, or a tracking pixel path, the browser
will refuse to wrap and the text will overflow horizontally past the card. The fix is one
line in `base.css`:

```css
p {
  margin: 0;
  overflow-wrap: anywhere;
}
```

`overflow-wrap: anywhere` is the modern property (2020+) that supersedes `word-break: break-all`
for non-CJK text — it only breaks when no natural break point exists, so normal paragraphs look
the same. Set it globally on `p { }` so every current and future view is covered; do NOT add it
per-component.

---

## iCal (RFC 5545) parsing

### The split(':').next() trap

`"BEGIN:VEVENT".split(':').next()` returns `"BEGIN"` — not `"BEGIN:VEVENT"`. The split-off name
is identical for `BEGIN:VEVENT`, `BEGIN:VCALENDAR`, `END:VEVENT`, and `END:VCALENDAR`. If you
detect the block by comparing the name alone, you'll match all four. Detect by checking the
**full uppercased line** for the block keyword:

```ts
// ❌ matches both BEGIN:VEVENT and BEGIN:VCALENDAR
const name = line.split(':').next().toUpperCase();
if (name === "BEGIN" && line.includes("VEVENT")) { /* correct check */ }

// ✅ simpler — check the whole line
const upper = line.toUpperCase();
if (upper.startsWith("BEGIN") && upper.includes("VEVENT")) { /* correct */ }
```

Same gotcha for `split_property` — it correctly splits on the first `:`, but property lines like
`DTSTART;TZID=America/New_York:20260101T100000Z` need the TZID parameter extracted from the
name side, not the value side.

### Line unfolding

RFC 5545 §3.1: a CRLF (or LF) followed by a single space or tab is removed and the continuation
joins the prior line. Our `unfold` drops just the CRLF + the first whitespace, keeping any
additional leading whitespace:

```text
SUMMARY:Long\r\n
  continuation line

→ SUMMARY:Long continuation line
```

(One leading space preserved, matching the spec — not "no space".)

---

## Sidebar labels

Don't pre-truncate. The prototype-v11 originally had `label.slice(0, 5)` to keep the rail narrow,
which displays as "Strea", "Recor", "Conta" — hostile to long words like "Companies" or
"Follow-ups". Use the full label with `text-overflow: ellipsis` + `white-space: nowrap`, and let
the sidebar width grow to accommodate. After this change the desktop sidebar is 96px wide
(`--sidebar-width` in `tokens.css`) — enough for "Companies" and "Follow-ups" without ellipsis.

---

## Toast "View" actions

A toast with an action that navigates elsewhere (Calendar jump, open message, etc.) needs the
callback to be **self-contained and idempotent**. Toasts are dismissable — the user can swipe
them away or wait for the auto-dismiss — so by the time the action fires, the relevant signal
might have been reset. Always include both the navigation and any state updates inside the
`run()` closure:

```ts
action: invite.dtstart
  ? {
      label: "查看",
      run: () => {
        const d = new Date(invite.dtstart!);
        sessionStorage.setItem("calendarJumpDate", d.toISOString());
        setCalendarJumpTo(Date.now());  // bump the global stamp
        setView("calendar");             // navigate
      },
    }
  : undefined,
```

Forgetting to call `setX` and only navigating means the destination view is still showing stale
data. The `setX` signal + the target view's `createEffect(() => { stamp; … })` is the standard
"jump to" pattern across the app.

---

## Playwright on Tauri builds

The pre-JS splash overlay declared in `index.html` blocks Playwright from finding topbar text
because the splash's `SendPalm` wordmark matches the same `text=SendPalm` locator as the titlebar.
Two fixes:

```ts
// 1. Wait for SolidJS to mount and dismiss the splash.
await page.locator("body.app-ready").waitFor({ timeout: 5_000 });

// 2. Scope the locator to the titlebar.
await expect(page.locator("#titlebar")).toContainText("SendPalm");
```

This came up when we added the splash — `expect(locator("text=SendPalm")).toBeVisible()` started
matching the hidden wordmark `<div class="word">` inside the splash and failing with "expected
visible, received hidden".

---

## `safeInvoke` parameter-name silence

The frontend `safeInvoke<T>("command", args)` returns `null` when the Rust side doesn't know
the command. If you rename a Rust parameter without updating the frontend, the call still
returns `null` (no error thrown), the UI shows "no mock data", and the user thinks the feature
works. Always keep `safeInvoke<…>` argument names in sync with the `#[tauri::command]` argument
names. The single best defense is a TypeScript type for the args:

```ts
// types/tauri.ts
export interface SendMessageArgs {
  to: string;
  subject: string;
  body: string;
  accountId?: string;
}
export function sendEmailViaBackend(args: SendMessageArgs): Promise<{ message_id: string } | null> {
  return safeInvoke<{ message_id: string }>("send_message", args);
}
```

Now the compiler catches any drift between the Rust signature and the frontend caller.

---

## Tauri store plugin quirks

`tauri-plugin-store` writes `sendpalm.prefs.json` to disk only when you call `store.save()`.
Reads via `store.get(...)` work against the in-memory cache, so a view that reads but never
writes will appear to work in dev but produce no file. The `bootstrap.ts` MUST always
`store.set("onboarding_completed", true); store.save();` — never just `setOnboardingCompleted(true)`
in memory. Without the file materializing, a fresh install has no record of completion and the
onboarding shows again on next launch.

---

## iOS Simulator automation

Three things to know before you spend an afternoon discovering them:

1. **`devUrl` hash/query don't reach the WKWebView.** The iOS bundle's webview strips
   fragments and queries appended to `devUrl` in `tauri.conf.json`. Don't try to drive
   behavior from `#onboard-skip` — bake the state in code or use a real URL scheme via
   `tauri-plugin-deep-link`.

2. **AppleScript / `osascript` clicks don't reach the WKWebView** without an interactive macOS
   Accessibility prompt (and Tauri blocks the prompt silently in headless test runs). Don't try to
   automate UI by sending AppleScript clicks to the Simulator window — use `cliclick` (Homebrew)
   or a registered deep-link scheme.

3. **`xcrun simctl` has no `tap` subcommand** in any Xcode 16/17 build we tried. The `ui` subcommand
   only sets status-bar appearance (light/dark/contrast), not tap coordinates. For interactive
   testing, either register a scheme and `simctl openurl`, or use `cliclick`.

4. **Bundle rebuilds need a clean build dir.** Iterating on `index.html` or icons leaves stale
   outputs in `src-tauri/gen/apple/build` and the next `pnpm tauri ios build` fails with
   "Directory not empty (os error 66)" when renaming the .app. Always
   `rm -rf src-tauri/gen/apple/build` between rebuilds.

---

## Multi-account sync reload

The sync loop's reload-every-60s pattern needs `JoinHandle::abort()` to stop in-flight per-account
tasks before spawning fresh ones — otherwise old tasks continue running against a deleted
account's credentials. The pattern:

```rust
let mut handles: HashMap<String, (Arc<AtomicBool>, JoinHandle<()>)> = HashMap::new();
loop {
    let desired = load_sync_accounts(&pool).await?;

    // start missing
    for account in &desired {
        if !handles.contains_key(&account.account_id) {
            let stop = Arc::new(AtomicBool::new(false));
            let handle = spawn_account_loop(app.clone(), pool.clone(), account.clone(), stop.clone());
            handles.insert(account.account_id.clone(), (stop, handle));
        }
    }

    // signal + abort removed
    let desired_ids: HashSet<_> = desired.iter().map(|a| a.account_id.clone()).collect();
    for id in handles.keys().filter(|k| !desired_ids.contains(*k)).cloned().collect::<Vec<_>>() {
        if let Some((stop, handle)) = handles.remove(&id) {
            stop.store(true, Ordering::Relaxed);
            handle.abort();
            // best-effort cleanup of persisted sync state
            let _ = delete_sync_state(&pool, &id).await;
        }
    }

    tokio::time::sleep(ACCOUNT_RELOAD_INTERVAL).await;
}
```

The per-account loop checks `stop.load(Ordering::Relaxed)` between `idle_wait` cycles (up to
5 minutes later), so removed accounts stop within one tick of the next reload. If you need
sharper teardown, swap `Arc<AtomicBool>` for `tokio_util::sync::CancellationToken` and call
`stop.cancelled()` inside `idle_wait`'s polling loop.