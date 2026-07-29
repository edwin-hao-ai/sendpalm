# Relay Design System

> Apple-inspired clarity · Glass-morphism depth · Calm technology  
> All future design and development MUST flow from this document.

---

## 1. Philosophy

Relay is a local-first AI communication copilot — a desktop app that lives in the background, watching your communications, extracting knowledge, and suggesting actions. The design must feel:

- **Calm** — not demanding attention, always available
- **Premium** — like a native Mac app from Apple
- **Intelligent** — the UI reflects the agent's awareness
- **Spatial** — depth and layering to communicate hierarchy

---

## 2. Layout Architecture

### 2.1 Screen Structure

```
┌──────┬─────────────────────────────────┬────────────────┐
│ Nav  │ Content Area                    │ Agent Panel    │
│ 48px │ (flex-grow)                     │ 340px          │
│      │                                 │ (collapsible)  │
│ icons│  ┌─ Cards ──────────────────┐   │ ┌────────────┐ │
│ only │  │                          │   │ │ Context    │ │
│      │  │  Glass-morphism          │   │ │ Actions    │ │
│      │  │  surfaces                │   │ │ Chat       │ │
│      │  └──────────────────────────┘   │ └────────────┘ │
└──────┴─────────────────────────────────┴────────────────┘
```

- **8px grid** — all spacing, padding, margins are multiples of 4
- **Three-column** layout on desktop (>=1024px)
- **Agent panel** can collapse to 0px (toggled via keyboard shortcut or button)
- **Content area** has 24px padding on sides, 20px top

### 2.2 Material Hierarchy (3-Level Glass)

| Level | Usage | Background | Blur | Border |
|-------|-------|-----------|------|--------|
| L1 (deepest) | Page background, app shell | `#08090d` | — | — |
| L2 (mid) | Cards, panels, sidebars | `rgba(255,255,255,0.03)` | `24px` | `0.5px rgba(255,255,255,0.06)` |
| L3 (top) | Modals, popovers, floating UI | `rgba(255,255,255,0.06)` | `32px` | `0.5px rgba(255,255,255,0.10)` |

Transition between layers: L2 elements cast `0 8px 32px rgba(0,0,0,0.3)` shadow.  
L3 elements cast `0 16px 48px rgba(0,0,0,0.5)` shadow.

---

## 3. Color

### 3.1 Base Palette

```
Deep Midnight    #08090d    — app background, nav
Surface Glass    rgba(255,255,255,0.03)  — default card
Glass Hover      rgba(255,255,255,0.06)  — card hover
Glass Active     rgba(255,255,255,0.10)  — card active/pressed
Border Subtle    rgba(255,255,255,0.06)  — 0.5px borders
Border Glass     rgba(255,255,255,0.10)  — elevated borders
```

### 3.2 Functional Colors

```
Primary          #6C5CE7    — actions, active nav, links
  Primary Dim    rgba(108,92,231,0.12)   — subtle backgrounds
  Primary Glow   rgba(108,92,231,0.25)   — glow effects

Accent Warm      #d4a574    — highlights, org entities, gold
  Accent Dim     rgba(212,165,116,0.12)

Secondary        #4ECDC4    — projects, success states, teal
  Secondary Dim  rgba(78,205,196,0.12)

Red              #ef4444    — errors, alerts
  Red Dim        rgba(239,68,68,0.12)

Green            #4ade80    — online status, confidence
  Green Dim      rgba(74,222,128,0.12)

Yellow           #facc15    — warnings, dates
  Yellow Dim     rgba(250,204,21,0.12)
```

### 3.3 Text Opacity

```
Primary         rgba(240,240,244,0.95)  — body text
Secondary       rgba(240,240,244,0.60)  — labels, descriptions
Muted           rgba(240,240,244,0.35)  — placeholders, timestamps
Inverse         #08090d                  — text on primary bg
```

---

## 4. Typography

### 4.1 Font Stack

| Role | Font | Fallback |
|------|------|----------|
| UI Text | Geist Sans | `-apple-system, system-ui, sans-serif` |
| Display/Headings | Clash Display | `Geist Sans, sans-serif` |
| Monospace / Code | Geist Mono | `SF Mono, monospace` |

### 4.2 Type Scale

```
--text-xs:  0.55rem  (9px)   — badges, labels
--text-sm:  0.60rem  (10px)  — captions, metadata
--text-base: 0.70rem (11px)  — body text, cards
--text-md:  0.80rem  (13px)  — card titles, section headers
--text-lg:  0.90rem  (14px)  — view titles, nav labels
--text-xl:  1.10rem  (18px)  — page headings
--text-2xl: 1.40rem  (22px)  — splash, hero text
```

All display text (h1, h2) uses Clash Display with `-0.02em` letter-spacing.  
UI text uses Geist Sans with default letter-spacing.

### 4.3 Line Heights

```
Body: 1.6
Headings: 1.2
Labels: 1.4
```

---

## 5. Glass-Morphism (毛玻璃效果)

This is the signature visual treatment. Every surface uses it.

### 5.1 Implementation

```css
.glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 0.5px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}
```

### 5.2 Variants

| Variant | Background | Blur | Border | Shadow |
|---------|-----------|------|--------|--------|
| Default | `rgba(255,255,255,0.03)` | `24px` | `0.5px rgba(255,255,255,0.06)` | — |
| Hover | `rgba(255,255,255,0.06)` | `24px` | `0.5px rgba(255,255,255,0.10)` | `0 4px 16px rgba(0,0,0,0.2)` |
| Elevated | `rgba(255,255,255,0.06)` | `32px` | `0.5px rgba(255,255,255,0.10)` | `0 16px 48px rgba(0,0,0,0.5)` |
| Nav item | `rgba(108,92,231,0.12)` | `16px` | — | — |

### 5.3 Background Mesh

The app background features 3 animated glowing orbs (blur: 80px) positioned at:
- Top-left: Primary purple (#6C5CE7), 600px
- Bottom-right: Secondary teal (#4ECDC4), 500px  
- Center: Warm accent (#d4a574), 400px

These create the ambient "aura" that shines through the glass surfaces.  
Animation: slow float (20-25s per cycle) with subtle scale transformation.

---

## 6. Corner Radii

```
--radius-sm:  6px     — inputs, small elements
--radius-md:  10px    — cards, panels
--radius-lg:  14px    — modals, large containers
--radius-xl:  18px    — splash, hero sections
```

All radii use generous Apple-style values. Never use sharp corners.

---

## 7. Spacing (8px Grid)

```
--space-1:  4px   — micro gaps
--space-2:  8px   — tight spacing
--space-3:  12px  — default padding
--space-4:  16px  — card padding
--space-5:  20px  — section padding
--space-6:  24px  — view padding
--space-8:  32px  — large gaps
--space-10: 40px  — section margins
--space-12: 48px  — major section breaks
```

Padding inside cards: 16px.  
Gap between cards in grid: 14px.  
View padding from edges: 24px horizontal, 20px vertical.

---

## 8. Motion & Animation

### 8.1 Timing Curves

```css
--spring: cubic-bezier(0.16, 1, 0.3, 1);
--spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

Always use spring curves. Never use `ease` or `ease-in-out`.

### 8.2 Durations

| Duration | Usage |
|----------|-------|
| 0.15s | Hover states, micro-interactions |
| 0.25s | Button clicks, chip selection |
| 0.35s | Card hover, element transitions |
| 0.40s | View transitions, panel open/close |
| 0.50s | Agent panel expand/collapse |
| 0.60s | Loading states, modal enter/exit |

### 8.3 Patterns

| Pattern | CSS |
|---------|-----|
| View entrance | `opacity: 0 → 1` + `translateY(8px → 0)` over 0.4s spring |
| Message appear | `opacity: 0 → 1` + `translateY(6px → 0)` over 0.3s spring |
| Hover lift | `transform: translateY(-1px)` + `box-shadow` increase |
| Press feedback | `transform: scale(0.97)` over 0.15s |
| Page transition | New view fades in, old view fades out (no cross-fade) |
| Agent pulse | Expanding ring on agent avatar, 2s loop |

---

## 9. Iconography

### 9.1 Source

**Phosphor Light** — thin, elegant line icons.  
Loaded via CDN: `@phosphor-icons/web@2.1.1`

### 9.2 Sizing

```
--icon-xs:  0.60rem  — inline with text
--icon-sm:  0.75rem  — nav items, section icons
--icon-md:  0.90rem  — feature icons, card headers
--icon-lg:  1.20rem  — nav bar icons
--icon-xl:  1.60rem  — empty states
--icon-2xl: 2.20rem  — splash, hero
```

### 9.3 Color Mapping

| Context | Color |
|---------|-------|
| People, users | Primary `#6C5CE7` |
| Organizations | Accent Warm `#d4a574` |
| Projects | Secondary `#4ECDC4` |
| Alerts | Red `#ef4444` |
| Success | Green `#4ade80` |
| Calendar, dates | Yellow `#facc15` |
| Inactive/Muted | Text Muted `rgba(240,240,244,0.35)` |

---

## 10. Component Specs

### 10.1 Navigation Bar (Left)

```
Width: 48px (52px including border)
Background: #08090d (deepest layer)
Border-right: 0.5px rgba(255,255,255,0.06)
Items: 34×34px, border-radius: 8px
Active indicator: 2px vertical bar (Primary) on left
Icon size: 1.15rem
Badge: 14px circle, Red, top-right, font-size: 0.40rem
```

### 10.2 Agent Panel (Right)

```
Width: 340px (when open), 0px (when collapsed)
Background: L2 glass (rgba(255,255,255,0.03), blur 24px)
Transition: width 0.5s spring
Sections: Header (56px) → Context → Actions → Events → Chat → Input
Chat: scrollable, flex-grow, 10px padding
Input: fixed at bottom, 8px padding, glass
```

### 10.3 Cards

```
Padding: 16px
Border-radius: 14px
Background: L2 glass
Border: 0.5px rgba(255,255,255,0.06)
Hover: background → rgba(255,255,255,0.06), border → rgba(255,255,255,0.10)
Transition: all 0.35s spring
```

### 10.4 Buttons

```
Primary:
  Background: #6C5CE7
  Text: #ffffff
  Padding: 6px 14px (small), 10px 24px (large)
  Border-radius: 8px
  Hover: opacity 0.85, translateY(-1px), box-shadow glow
  Active: scale(0.97)

Secondary:
  Background: rgba(255,255,255,0.06)
  Border: 0.5px rgba(255,255,255,0.06)
  Text: rgba(240,240,244,0.60)
  Hover: background → rgba(255,255,255,0.10), text → rgba(240,240,244,0.95)
```

### 10.5 Input Fields

```
Height: 32px (standard), 36px (large)
Background: L2 glass
Border: 0.5px rgba(255,255,255,0.06)
Border-radius: 6px
Padding: 0 10px (0 30px with icon)
Focus: border → Primary (#6C5CE7)
Placeholder: text-muted
Font: Geist Sans, 0.52rem
Transition: border-color 0.3s spring
```

### 10.6 Action Cards (AIP-style)

```
Structure: Icon | Title + Description + Meta | Buttons
Background: L2 glass (slightly elevated)
Hover: border → glass, lift effect
Icon area: 24×24px, rounded 6px, color-coded by action type
Meta: trigger tag, confidence %, step count
Footer: Review (secondary) + Execute (primary) buttons
```

---

## 11. Dark & Light Mode

### 11.1 Dark Mode (Default)

Ambient dark — true dark base with subtle colored glow orbs.

| Element | Dark Mode | Light Mode |
|---------|-----------|------------|
| Base background | `#08090d` | `#f5f5f7` |
| Surface L2 | `rgba(255,255,255,0.03)` blur 24px | `rgba(255,255,255,0.70)` blur 24px |
| Surface L3 | `rgba(255,255,255,0.06)` blur 32px | `#ffffff` blur 32px |
| Text primary | `rgba(240,240,244,0.95)` | `rgba(0,0,0,0.85)` |
| Text secondary | `rgba(240,240,244,0.60)` | `rgba(0,0,0,0.55)` |
| Text muted | `rgba(240,240,244,0.35)` | `rgba(0,0,0,0.35)` |
| Mesh blobs opacity | `0.12` | `0.04` |
| Primary | `#6C5CE7` | `#5B4CDB` (slightly deeper) |
| Scrollbar | 4px, thumb `rgba(255,255,255,0.08)` | thumb `rgba(0,0,0,0.12)` |
| Selection | `rgba(108,92,231,0.30)` | same |
| Focus ring | `var(--primary)` 2px offset | same |

### 11.2 Theme Toggle

- Button in topbar (sun/moon icon)
- Persisted to `localStorage('relay-theme')`
- Smooth transition on all background/border/text properties
- Light mode: Apple off-white `#f5f5f7`, white elevated cards, subtle borders

---

## 12. Agentic UI (Palantir AIP-Inspired)

The agent panel follows Palantir AIP's three-layer model:

1. **Context Bar** — "Viewing: [current view]" + 3 quick-action chips
2. **Suggested Actions** — event-triggered action cards with Review/Execute
3. **Event Stream** — real-time feed of agent activity

Each action card must show:
- What triggered it (inbound event)
- What the action does
- Confidence score
- Step count for the workflow
- Review + Execute buttons

---

## 13. Implementation Guidelines

### 13.1 CSS Architecture

Use CSS custom properties defined in `:root`. All colors, spacing, typography MUST reference these variables — never use raw values.

### 13.2 Prohibited Patterns

```
❌ Inter, Roboto, system-ui as primary font
❌ Thick icon sets (Font Awesome Solid, Material Filled)
❌ 1px solid borders (use 0.5px)
❌ harsh box-shadows without blur
❌ linear transitions (use spring curves)
❌ emojis in UI (use Phosphor icons)
❌ flat cards without glass effect
❌ default browser focus outlines
```

### 13.3 Required Patterns

```
✅ Geist Sans for UI, Clash Display for headings
✅ Phosphor Light icons
✅ 0.5px borders with rgba
✅ Glass-morphism with backdrop-filter: blur()
✅ Spring curves for all transitions
✅ 3-level depth hierarchy (deep → mid → top)
✅ Generous whitespace (40px+ section gaps)
✅ Nested cards (cards within cards for depth)
✅ Color-coded entity types (person/org/project)
✅ Agentic action cards with trigger metadata
```
