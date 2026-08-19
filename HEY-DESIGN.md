# SendPalm Design Language — HEY-Inspired Token Specification

> Calm · Warm · Opinionated · Human-scale  
> All future SendPalm UI must flow from this document.  
> Derived from HEY.com's design philosophy + SendPalm's AI-agent differentiation.

---

## 1. Design Philosophy

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Calm > Dense** | Generous whitespace, large type, breathing room. Never a spreadsheet. |
| **Opinionated defaults** | Ship with a POV on how email *should* work. The user, not the sender, controls attention. |
| **Warm & approachable** | Fisher-Price clarity — friendly, never corporate. Warm paper palette, not sterile white. |
| **Start weird, pare back** | Early prototypes can be experimental. Final product focuses on what survives honest use. |
| **No Inbox Zero tyranny** | Emails flow like a river. Read it → it drops to "Previously Seen." Time takes care of the rest. |
| **Everything has a physical metaphor** | Piles, drawers, fans, bubbles — digital objects have analog weight. |
| **Look at what we're NOT doing** | No unread count anxiety, no IMAP, no folders/labels, no AI importance sorting. |

### Emotional Tone

```
🗣️ Voice:  Conversational, plain-spoken, self-aware
🎨 Visual: Warm minimalism with joyful surprises
💡 UX:     Opinionated but learnable. One obvious way to do things.
✨ Delight: Bouncy fans, bubble pops, section bands — small moments of joy
```

---

## 2. Color Palette — Warm Paper Base

### Base Canvas

```
--paper:        #f9f7f5    /* Warm off-white — main page floor */
--paper-light:  #fcfaf8    /* Lighter variant for elevated surfaces */
--paper-mid:    #f0eeea    /* Subtle card / grouped surface */
--paper-dark:   #e8e4e0    /* Quiet button, divider background */

--ink:          #231c33    /* Deep purple-ink — every line of type */
--ink-soft:     #736c83    /* Muted purple-grey — captions, metadata */
--ink-muted:    #a09aae    /* Placeholders, timestamps */
--ink-border:   rgba(35,28,51,0.08)  /* Hairline — all borders */
```

### Accent Palette

```
--blurple:      #5522fa    /* Electric blurple — links, primary action */
--cobalt:       #0074e4    /* Secondary blue, gradient partner */

--mint:         #b3f4e0    /* Signature mint — most-used background accent */
--teal:         #5fddc5    /* Bright teal accent */
--sky:          #b6dbff    /* Pale-blue section band */
--canary:       #fff5ca    /* Pale-yellow section band */
--peach:        #ffe5da    /* Pale-peach section band */
--lavender:     #d5d2ff    /* Pale-violet section band */

--yellow:       #f5d652    /* Signature warm-yellow accent */
--orange:       #f87917    /* Warm-orange accent */
--coral:        #f95c5c    /* Hot-coral accent */
--salmon:       #ec8580    /* Muted-coral gradient partner */
--pink:         #cf6fb6    /* Magenta-pink accent */
--purple:       #7700a2    /* Deep magenta-purple accent */
--green:        #299850    /* Success / confirmation green */
```

### SendPalm-Specific Extensions

```
--palm:         #0A8F63    /* SendPalm signature green — brand anchor */
--palm-bright:  #0CB87D    /* Hover / active variant */
--palm-soft:    rgba(10,143,99,0.10)  /* Subtle background */
--palm-glow:    rgba(10,143,99,0.18)  /* Shadow / glow */

--agent:        #6C5CE7    /* Agent UI — purple for AI actions */
--agent-soft:   rgba(108,92,231,0.10)
```

### Key Color Rules

- **One ink color for all type**: `#231c33` — warmer than `#000`, violet cast ties into blurple brand
- **Full-bleed pastel section bands**: Each major section gets its own background (mint, sky, canary, peach, lavender)
- **Diagonal 135° gradients**: Pairs brights into duos (mint→sky, blurple→cobalt, peach→canary, coral→salmon)
- **Text never changes color** — ink everywhere; let backgrounds run wild
- **Hairlines**: `rgba(35,28,51,0.06)` or `rgba(35,28,51,0.10)` — never `#ddd` or `#e5e5e5`
- **App is light-mode by default** with optional dark mode

### 2.1 Brand Mark

The SendPalm brand mark is built from **three elements only**, at every size:

1. **Green plate** — `var(--palm)` flat fill (`#0A8F63`) on the 32-viewBox mark, or the diagonal `--palm-bright → --palm` gradient (`#0CB87D → #0A8F63`) on the 256-viewBox full logo. Corner radius = `~22%` of edge length (`rx=7` on 32, `rx=56` on 256).
2. **White paper plane** — single geometric silhouette (upper wing + folded underside at 70% opacity). No envelope, no palm tree, no decoration.
3. **Canary dot** — `var(--canary)` (`#FFF5CA`) circle in the top-right corner with a thin white stroke. Anchors the mark the same way `.logo-dot` does in `prototype-v11.js` (topbar-logo-mark).

The mark scales cleanly because the paper plane is one `<path>` and the dot is one `<circle>` — both are SVG primitives that render identically at 16px (favicon) and 512px (splash / app icon).

#### Asset Map

| File | viewBox | Use | Contents |
|------|---------|-----|----------|
| `app/src/assets/favicon.svg` | 32×32 | Browser tab (`<link rel="icon">`), 16/32/64px renderings | Plate + paper plane only. No canary dot — at favicon scale the dot is a single pixel and looks like noise. |
| `app/src/assets/logo-mark.svg` | 32×32 | Topbar `BrandMark` and any inline embed | Plate + paper plane + canary dot. |
| `app/src/assets/logo.svg` | 256×256 | Launch splash, `apple-touch-icon`, **source for every Tauri bundle icon** | Same three elements scaled up, with the gradient plate. |

#### Bundle icon pipeline

`pnpm tauri icon app/src/assets/logo.svg` regenerates every icon under `app/src-tauri/icons/` (`.icns`, `.ico`, `.png` at all standard sizes, plus iOS `AppIcon-*` and Android `mipmap-*` sets). The script sources from `logo.svg` only — never from the older wordmark or the legacy envelope composition. Re-run after any visual change to `logo.svg`.

#### Don'ts

- **Don't** redraw the paper plane with the folded underside as the same color — the 30% opacity split is what makes the silhouette read as 3D at small sizes.
- **Don't** add the palm-tree accent to the favicon or the mark. It belongs to the onboarding hero, not the brand mark.
- **Don't** use the legacy envelope+plane composition. It was retired when the mark collapsed to three elements.
- **Don't** ship a separate wordmark SVG — `BrandMark` is the single source of truth for any inline "SendPalm" lockup.

---

## 3. Typography

### Font Stack

| Role | Stack |
|------|-------|
| Display / Headlines | `"Really Sans Large", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |
| Body / UI | `Moniker, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif` |
| Mono / Code | `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace` |
| Serif (optional hero) | `"Playfair Display", "New York", Georgia, serif` |

### Type Scale

| Token | Size | Weight | Line Ht | Tracking | Family | Use |
|-------|------|--------|---------|----------|--------|-----|
| display-hero | `clamp(48px, 6vw, 74px)` | 900 | 1.0 | -0.02em | Display | Landing hero, splash |
| display-lg | `clamp(40px, 5vw, 56px)` | 900 | 1.05 | -0.015em | Display | Feature section titles |
| h1 | `clamp(32px, 4vw, 44px)` | 800 | 1.1 | -0.01em | Display | Page headings |
| h2 | `clamp(24px, 3.5vw, 34px)` | 800 | 1.15 | -0.008em | Display | Section headings |
| h3 | `clamp(20px, 2.5vw, 26px)` | 700 | 1.25 | 0 | Display | Card titles |
| h4 | 20px | 700 | 1.3 | 0 | Display | Panel headings |
| body-xl | 28px | 400 | 1.4 | 0 | Body | Hero body, intros |
| body-lg | 20px | 400 | 1.5 | 0 | Body | Feature descriptions |
| body | 18px | 400 | 1.5 | 0 | Body | Default reading size |
| body-sm | 16px | 400 | 1.45 | 0 | Body | Compact reading |
| label | 14px | 700 | 1.4 | 0 | Body | Section labels |
| button | 16px | 700 | 1.2 | 0 | Body | All buttons |
| caption | 13px | 500 | 1.4 | 0.01em | Body | Metadata, timestamps |
| micro | 11px | 600 | 1.3 | 0.02em | Body | Badges, pill counts |

### Typography Rules

- **Body set at 18px minimum** — conversational, spoken quality
- **900 weight is the headline signature** — thick-stroked, line-filling
- **`ch` units** for readable column widths (content-aware)
- **`em`-based spacing** so padding/margins scale with type
- **Single `.btn` class** — size changes via `font-size` utility (em padding auto-scales)

---

## 4. Layout Architecture

### 4.1 App Layout

```
┌──────────────────────────────────────────────────────┐
│ Titlebar (32px) — traffic lights + centered title    │
├──────────────────────────────────────────────────────┤
│ Topbar (52px) — search / view title / avatar          │
├──────┬────────────────────────────┬──────────────────┤
│ Nav  │ Content Area               │ Detail Panel     │
│ 64px │ (flex-grow)                │ 380px            │
│      │  ┌──────────────────────┐  │ (slide from      │
│icons │  │ Feed List            │  │  right)          │
│only  │  │ • New for You        │  │ ┌────────────┐   │
│      │  │ • Previously Seen    │  │ │ Thread     │   │
│      │  │                      │  │ │ Content    │   │
│      │  │ ↓ Piles (bottom)     │  │ │ Actions    │   │
│      │  └──────────────────────┘  │ └────────────┘   │
├──────┴────────────────────────────┴──────────────────┤
│ Agent FAB (floating, bottom-right)                    │
│ Drop Bar (on drag, floating bottom-center)            │
└──────────────────────────────────────────────────────┘
```

### 4.2 Grid & Spacing

```
Grid base: 4px
Scale: 0 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128

--space-1:  4px    — micro gaps
--space-2:  8px    — tight spacing, icon gaps
--space-3:  12px   — default padding (buttons, pills)
--space-4:  16px   — card internal padding
--space-5:  20px   — section padding, spacing between cards
--space-6:  24px   — view padding from edges
--space-8:  32px   — large internal gaps
--space-10: 40px   — between sections
--space-12: 48px   — major section breaks
--space-16: 64px   — hero spacing
```

### 4.3 Layout Rules

- **No sidebar menu** — navigation is a sidebar rail (64px, icon-only) with FAB-style compose
- **Single-column feed** — never split-pane on the main view
- **Detail panel** slides in from right (380px) as a drawer overlay
- **Bottom-anchored piles** — Reply Later, Set Aside, Bubble Up sit at bottom of Imbox (like macOS dock)
- **Full-width email list** with large rows
- **Max content width**: 720px (feed list), 560px (gate cards)
- **Section padding**: generous 96-128px on full-bleed bands (marketing)
- **Card internal padding**: 24-32px

---

## 5. Shapes & Border Radius

| Tier | Value | Use |
|------|-------|-----|
| Micro | 4px | Inline tags, fine inset chips |
| Standard | 8px | Small controls, dense UI elements |
| Comfortable | 12px | Text inputs, form fields, cards |
| Relaxed | 16px | Content cards, panels, modals |
| Large | 24px | Floating cards, hero sections |
| Pill | 9999px | All buttons, badges, chips |

### Defining Rules

- **Buttons and badges are always fully pill-shaped** (`border-radius: 9999px`)
- **Content surfaces round generously** (12-16px)
- **Nothing has a sharp corner** — even inputs and textareas round at 8px
- **Cards within a feed list** can have `0` border-radius if they're edge-to-edge; use bottom borders for separation
- **Modals and popovers**: 16px

---

## 6. Shadows & Elevation

```
--shadow-sm:  0 1px 2px rgba(35,28,51,0.04)
--shadow-md:  0 4px 12px rgba(35,28,51,0.06), 0 1px 2px rgba(35,28,51,0.03)
--shadow-lg:  0 8px 24px rgba(35,28,51,0.08), 0 2px 4px rgba(35,28,51,0.04)
--shadow-xl:  0 16px 48px rgba(35,28,51,0.10), 0 4px 8px rgba(35,28,51,0.06)

Multi-layer shadow stacks for soft, paper-cutout float.
Reserved for: floating nav, modals, detail panel, drop bar.
Cards in feed list use --shadow-sm or none.
```

---

## 7. Motion & Animation

### 7.1 Timing Curves

```css
--spring: cubic-bezier(0.16, 1, 0.3, 1);
--spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
```

### 7.2 Durations

| Duration | Usage |
|----------|-------|
| 0.12s | Hover states, micro-interactions |
| 0.20s | Button clicks, chip selection |
| 0.28s | Card hover, element transitions |
| 0.35s | View transitions, panel open/close |
| 0.40s | Toast enter/exit |
| 0.50s | Modal open/close |

### 7.3 Interactive Patterns

| Pattern | Implementation |
|---------|---------------|
| **View entrance** | `opacity: 0→1` + `translateY(10px→0)` over 0.28s `ease-out` |
| **Feed item appear** | `opacity: 0→1` + `translateY(6px→0)` over 0.3s spring |
| **Detail panel slide** | `translateX(24px→0)` + `opacity: 0→1` over 0.28s ease-out |
| **Hover lift** | `translateY(-1px)` + shadow increase |
| **Press feedback** | `transform: scale(0.97)` over 0.12s |
| **Swipe dismiss** | `translateX(>80px)` + rotate + fade, 0.28s |
| **Pile drawer enter** | `translateY(10px→0)` with fade, 0.2s |
| **Toast enter** | `translateY(20px→0)` + fade, 0.25s |
| **Drop bar appear** | `translateY(20px→0)` + fade, 0.2s |
| **Bubble pop exit** | Scale inward then burst outward, CSS keyframes |
| **Bouncy fan (piles)** | Staggered reveal with spring bounce |

### 7.4 HEY Signature Animations

```css
/* Pile drawer "bouncy fan" — staggered item reveal */
@keyframes fan-enter {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.pile-item { animation: fan-enter 0.3s var(--spring-bounce) both; }
.pile-item:nth-child(1) { animation-delay: 0.02s; }
.pile-item:nth-child(2) { animation-delay: 0.06s; }
.pile-item:nth-child(3) { animation-delay: 0.10s; }

/* Bubble Up "Pop" — scale inward, then burst */
@keyframes bubble-pop {
  0% { transform: scale(1); opacity: 1; }
  40% { transform: scale(0.7); opacity: 0.8; }
  100% { transform: scale(1.2); opacity: 0; }
}
```

### 7.5 Transition Defaults

```css
* { transition: color 0.12s ease, background-color 0.12s ease; }
/* Always override with specific curves for motion elements */
```

---

## 8. Email Interaction Patterns (App Behavior)

### 8.1 The Screener (Gate)

```
Every first-time sender is blocked at the gate.
User reviews Tinder-style: approve (choose destination) or block forever.

States:
  - firstSeen: true   → appears in Screener queue
  - screened: false   → needs user decision
  - blocked: true     → permanently blocked
  - defaultBucket:    → imbox / feed / paperTrail

Animation: Card swipe left (block) or right (approve) with rotate.
```

### 8.2 The Imbox

```
Two sections:
  ┌─ New for You ─────────────────────────────────┐
  │  Unread emails, sorted by priority score       │
  │  Priority: wait > todo > done,                   │
  │            contact health × recency             │
  └────────────────────────────────────────────────┘
  ┌─ Previously Seen ──────────────────────────────┐
  │  Read emails, sorted by last opened             │
  │  No archive — reading drops it here             │
  └────────────────────────────────────────────────┘

Bottom piles (always visible when non-empty):
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Pending  │ │  Saved   │ │ Remind   │
  │ (Reply   │ │ (Set     │ │ (Bubble  │
  │  Later)  │ │  Aside)  │ │  Up)     │
  └──────────┘ └──────────┘ └──────────┘

Clicking a pile fans out items (bouncy animation).
```

### 8.3 The Feed (Stream)

```
For newsletters, promotions, long-reads.
  - No read/unread state
  - Just scroll and read
  - Inline full-screen on open
  - No notifications from Feed content
  - "You don't manage your Feed. You just scroll."
```

### 8.4 Paper Trail (Records)

```
For receipts, confirmations, shipping, transactional.
  - No read/unread state
  - Out of sight, out of mind
  - Searchable when needed
  - Quiet auto-filing
```

### 8.5 Reply Workflow

```
Reply Now (r):      Standard compose modal
Reply Later (l):    Moves to Pending pile at bottom
Set Aside (s):      Moves to Saved pile at bottom
Bubble Up (b):      Schedule to resurface

Focus & Reply:
  - Dedicated mode from Reply Later pile
  - Side-by-side: original email + reply composer
  - Knock out replies one after another
  - No incoming mail distraction
```

### 8.6 Bubble Up (Snooze)

```
Schedule emails to resurface:
  - Later Today (6PM)
  - Tomorrow (8AM)
  - This Weekend (Sat 8AM)
  - Next Week (Mon 8AM)
  - Pick a Date
  - Surprise Me (random time)

"Pop" animation on dismiss: scale inward → burst outward.
Bubbled Up section at top of Imbox — stays until popped.
```

### 8.7 Contact Page (Mission Control)

```
Every sender has a dedicated contact page:
  - Avatar with random saturated color
  - Health score + trend indicator
  - Relationship stage timeline
  - Routing controls (default bucket, notifications, blocking)
  - Auto-filing labels
  - Recycling (auto-delete older emails)
  - All threads with this sender
  - Upcoming meetings
  - Insights & communication patterns
```

---

## 9. Component Specs

### 9.1 Feed Card

```
┌─────────────────────────────────────────────────────────────┐
│ [●] Name                    ★ flag     · Timestamp           │
│ Subject — Preview text…                                     │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ ⏰ 🔖 💬 🗑️ (hover actions)                           │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

Height: 48-56px (compact single line) or 64px (with preview)
Padding: 11px 16px (left edge has 20px with unread dot)
Border-radius: 0 (edge-to-edge in feed list)
Border-bottom: 1px hairline
Unread indicator: 6px dot, accent color, left edge

Hover: background tint, translateX(1px)
Hover actions (feed-card-actions): appear on right
  - Pending (clock)
  - Saved (pin)
  - Remind (arrow up)
  - Archive (archive)
  - Trash (trash)

Swipe: left → Saved (green), right → Pending (yellow)
```

### 9.2 Sidebar Nav

```
Width: 64px
Background: --paper-mid
Border-right: hairline

Items: 48×48px, border-radius: 8px
Icon: 20px
Label: 10px, 600 weight, below icon
Active: accent color + accent-soft background
Badge: 14px circle, accent fill, top-right

Sections separated by thin rule.
```

### 9.3 Detail Panel

```
┌──────────────────────┐
│ Header (48px)         │
│ ← Close │ Title │ ⋮  │
├──────────────────────┤
│ Thread content        │
│ • AI Summary card     │
│ • Rendered / Source   │
│   toggle              │
│ • Messages (collapse  │
│   thread older msgs)  │
│ • Attachments         │
├──────────────────────┤
│ Actions               │
│ [Reply] [Pend] [Sv]   │
│ [Rmd] [...]           │
└──────────────────────┘

Width: 380px
Slide animation: translateX(24px → 0) + opacity
Background: --paper (blurred)
Border-left: hairline
```

### 9.4 Gate (Screener) Card

```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ [avatar] Name <email>           │ │
│ │          Company · Title        │ │
│ │                                 │ │
│ │          Subject                │ │
│ │          Preview text...        │ │
│ └─────────────────────────────────┘ │
│                                     │
│  [👍 Allow]             [👎 Block] │
│                                     │
│  (after Allow click)               │
│  [Inbox] [Stream] [Records]         │
└─────────────────────────────────────┘

Max-width: 560px
Card: border-radius: 16px, shadow-md
Swipe-out: translateX(120%) + rotate(4deg) + opacity 0
```

### 9.5 Context Menu

```
┌──────────────────────────────┐
│ [icon] Reply            [r]  │
│ [icon] Reply All             │
│ ─────────────────────────── │
│ [icon] Pending          [l]  │
│ [icon] Saved            [s]  │
│ [icon] Remind...        [b]  │
│ ─────────────────────────── │
│ [icon] Move to Inbox         │
│ [icon] Move to Stream        │
│ [icon] Move to Records       │
│ ─────────────────────────── │
│ [icon] Mark as spam      [!] │
│ [icon] Move to Trash     [#] │
│ [icon] Block sender          │
└──────────────────────────────┘

Background: rgba(249,247,245,0.96) + blur
Border-radius: 12px
Shadow: multi-layer stack
Item height: 32px
Divider: 1px hairline
```

---

## 10. Onboarding & First-Run

```
1. 3-step setup: Name → Email → Password
2. First few emails trigger the Screener with help text
3. Empty states explain each bucket's purpose:
   - Inbox: "重要的、需要你来处理的对话会出现在这里。"
   - Stream: "Newsletter 和订阅邮件会出现在这里。"
   - Records: "发票、收据、验证码和系统通知会安静地躺在这里。"
   - Gate: "所有新联系人都已经过筛选。"
4. Keyboard shortcuts cheatsheet (triggered by ?)
```

---

## 11. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `⌘1-7` | Gate / Inbox / Stream / Records / Contacts / Calendar / Files |
| `⌘N` | New message |
| `⌘K` | Command palette |
| `j/k` | Next/Previous email |
| `Enter` | Open selected email |
| `Esc` | Close panel, overlay, or modal |
| `r` | Reply (open selected) |
| `e` | Archive |
| `l` | Pending (Reply Later) |
| `s` | Saved (Set Aside) |
| `b` | Bubble Up (Remind tomorrow) |
| `#` | Trash |
| `!` | Spam |
| `x` | Select / deselect |
| `;` | Bulk actions |
| `/` | Search |
| `?` | Shortcuts cheatsheet |

---

## 12. CSS Architecture

### Variable Organization

```css
:root {
  /* Colors (40 vars) */
  --paper, --ink, --blurple, --mint, ..., --palm;

  /* Typography (12 vars) */
  --font-display, --font-body, --font-mono;
  --text-hero, --text-h1, --text-body, ..., --text-micro;

  /* Spacing (12 vars) */
  --space-1 through --space-16;

  /* Radii (6 vars) */
  --radius-sm through --radius-pill;

  /* Shadows (4 vars) */
  --shadow-sm through --shadow-xl;

  /* Motion (3 vars) */
  --spring, --spring-bounce, --ease-out;
}
```

### Prohibited Patterns

```
❌ system-ui or Inter as primary font (use Moniker / Really Sans)
❌ Thick icon sets (use Phosphor Light)
❌ 1px solid borders (use 0.5px hairlines with rgba)
❌ Harsh box-shadows without blur (use multi-layer stacks)
❌ Linear transitions for motion elements (use spring curves)
❌ Emojis in UI (use Phosphor icons)
❌ Flat cards — every surface needs at minimum a hairline border
❌ Default browser focus outlines
```

### Required Patterns

```
✅ Warm paper palette (not pure white #fff)
✅ One ink color for all type (#231c33)
✅ Pill-shaped buttons (border-radius: 9999px)
✅ Generous card radii (12-16px)
✅ Full-bleed colored section bands
✅ Single-column feed lists
✅ Bottom-anchored workflow piles
✅ Bouncy fan animation on pile reveal
✅ Swipe gestures on feed cards
✅ Spring curves for transitions
✅ ch units for readable column widths
✅ em-based spacing for proportional scaling
✅ Color-coded entity types (person/org/project)
✅ Agentic action cards with trigger metadata
```

---

## 13. Agent UI (SendPalm Differentiation)

### Agent FAB

```
Position: fixed, bottom-right (24px from edge)
Size: 44×44px, pill shape
Background: --agent (#6C5CE7)
Icon: sparkle (Phosphor Light)
Has-tasks indicator: pulsing glow ring
```

### Agent Panel

```
Width: 340px (slide from right)
Position: fixed, right side
Sections:
  Header: "SendPalm Agent" + close
  Context: "Viewing: [current view/contact/message]"
  Suggestions: 4 quick-action chips
  Tasks: In-progress tasks with step indicators
  Input: "Ask SendPalm..." text input
```

### Agent Action Cards

```
Structure: [Icon] Title + Description + Meta | [Review] [Execute]
Background: elevated surface with left accent border
Meta: confidence %, step count, trigger event
```

---

## 14. Responsive Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Titlebar hidden, sidebar→bottom tab bar, detail panel→full-screen |
| Tablet | 640-1024px | Full nav, 2-up layout |
| Desktop | 1024-1280px | Full layout |
| Wide | >1280px | Content caps at 1200px |

### Mobile Adaptations

- Sidebar becomes bottom tab bar (64px height)
- Detail panel becomes full-screen overlay (translateX 100%→0)
- Titlebar hidden
- Compose modal becomes full-screen
- Feed list becomes tighter (14px padding)
- People grid becomes single column
- Calendar becomes vertical stack