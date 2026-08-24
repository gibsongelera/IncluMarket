---
name: inclumarket-design
description: IncluMarket's design-token system, CSS layer order and visual conventions. Use when asked to "change the styling", "add a component", "fix the colors", "make it look better", "match the design", "theme it", or when editing anything under styles/ or adding a className. Encodes project-specific footguns that generic design-system skills do not know about.
license: MIT
metadata:
  project: inklumarket-next
  version: "1.0"
---

# IncluMarket Design System

## When to Use This Skill

Any edit to `styles/*.css`, any new `className`, any inline `style={{}}`, any
question about colour, spacing, or theming in this repo.

**Not** for general design theory — for that, defer to `design:design-system`
and `product-skills:ui-design-system`. This skill only covers what is specific
to this codebase.

## The one-paragraph orientation

There is **no Tailwind, no CSS framework, and no PostCSS pipeline**. The UI is
~3,400 lines of hand-written CSS in `styles/`, plus a design-token layer and a
runtime theming system that injects CSS custom properties into the document
head on every request. Do not suggest adding a framework.

## Layer order is load-bearing

`app/layout.tsx` imports these in exactly this order. Later files can override
earlier ones without `!important`; that is the mechanism, not an accident.

| File | Owns |
|---|---|
| `tokens.css` | Custom properties only. No selectors beyond `:root` and its state variants. |
| `base.css` | Reset, typography, `.sr-only`, `.skip-link`, focus ring, toasts. |
| `components.css` | `.btn`, `.badge`, `.pill`, `.card`, `.data-table`, `.tabs`, `.modal`, form controls, the a11y and chat widgets. |
| `layout.css` | Page shells: header, footer, buyer feed, cart, checkout, seller and admin regions. |
| `shopee.css` | Shopee-pattern additions: density, category strip, sticky cart bar. |
| `landing.css` | Landing and auth pages only. |
| `responsive.css` | **Every width media query in the project.** Imported last. |

**Rule:** a new width media query goes in `responsive.css`, nowhere else.
See the `inclumarket-responsive` skill.

## Three token footguns that have each caused a real bug

### 1. `--canvas-white` is a BACKGROUND token

Using it for `color:` produces white-on-white. This shipped **three times**:
`.tab` in `components.css` (every inactive tab invisible on four dashboards),
and inline styles on `app/admin/compliance/page.tsx` and
`app/admin/theme/page.tsx`.

Background-only tokens: `--canvas-white`, `--surface-gray`, `--surface-gray-2`,
`--color-body`, `--color-body-bg`, `--bg-rainbow`.

If you genuinely need light text, write `#FFFFFF` literally so the intent is
visible in review.

### 2. There is no `--muted` token

The token is `--text-muted`. `var(--muted)` was invalid at computed-value time
and silently did nothing. A defensive alias now exists, but write
`--text-muted`.

### 3. Red is a Guardrail 2 surface, not Guardrail 1

`tokens.css` states two guardrails:

1. Dark text on **light and gold** surfaces.
2. White text on **dark** surfaces.

`--brand-red` (`#C41E3A`) is dark. `--text-charcoal` on it measures **2.64:1**
and fails AA at every size. Three rules had exactly that, commented
`/* Guardrail 1 */`. `.badge--red` always had it right — white.

## Runtime theming

`lib/theme.ts` holds 8 presets (`default`, `womens_month`, `pride`,
`independence`, `christmas`, `holy_week`, `buwan_ng_wika`, `pwd_awareness`).
The active one is resolved server-side in `app/layout.tsx` and injected as an
inline `<style id="im-theme">` block.

Two things to know:

- The selector is `html:root` (specificity 0,1,1) so it outranks `tokens.css`'s
  plain `:root` (0,1,0) regardless of import order, while
  `:root[data-contrast="high"]` (0,2,0) still wins for high-contrast mode.
- **A new themeable colour must be added to all 8 presets**, not just `:root`,
  or it will be undefined under 7 of them.
- `themeVarsToCss()` filters every name and value before emitting. Values come
  from the database and land in raw CSS, so an unfiltered `</style>` payload
  would be stored XSS. Do not remove that filter.

## The accessibility font scale changes layout maths

`lib/a11y/prefs.ts` sets `document.documentElement.style.fontSize` anywhere
between **12px and 24px**. Every `rem` scales with it; every hardcoded `px`
does not.

**Never write a px offset that depends on an element's height.** `top: 84px` on
the sticky filter panel was wrong at 16px and badly wrong at 24px. Use `rem`,
`em`, or the measured `--header-total` / `--bottom-inset` properties.

## Scales

| Scale | Tokens | Use |
|---|---|---|
| Type | `--step-0` … `--step-5` | Headings map h1→`--step-4`, h2→`--step-3`, h3→`--step-2`. |
| Space | `--space-1` (0.25rem) … `--space-8` (4rem) | Padding, gaps, margins. Do not write bare `.35rem`. |
| Radius | `--radius-xs/sm/md/lg` | |
| Measure | `--measure` (68ch) | Cap on body copy. Admin text used to run the full 1200px. |
| Depth | `--z-sticky-bar` 20, `--z-header` 40, `--z-fab` 60, `--z-alert` 80, `--z-toast` 100 | Never write a bare z-index. |

## Component conventions

There is no `ui/` primitives folder and mostly no primitive components —
buttons, cards and inputs are CSS classes applied at each call site. That is
deliberate: the classes already give consistency and the token layer already
gives theming, so wrapping them in components would be churn with no
user-visible benefit.

Components exist only where **behaviour and ARIA wiring** would otherwise be
duplicated and get it wrong:

| Component | Why it exists |
|---|---|
| `components/Tabs.tsx` | The ARIA tabs pattern: roving tabIndex, arrow keys, `aria-controls`, a real panel. Four dashboards had none of it. |
| `components/TableWrap.tsx` | Focusable named scroll region + card labels derived from `<thead>`. |
| `components/Chart.tsx` | Canvas plus the data-table text alternative. |
| `components/MobileNav.tsx` | Bottom tab bar and More sheet. |
| `components/Pill.tsx` | Status colour semantics in one place. |

Other conventions:

- Modals are native `<dialog>`, so focus trapping and Esc come free.
- Icons come from `components/Icon.tsx`, a hand-maintained inline SVG set.
  Add to `ICONS` rather than importing a library.
- Money, dates and email masking go through `lib/format.ts`.
- Toasts fire a `window` CustomEvent — see `lib/toast.ts`.
- A new status value gets a new `.pill--<value>` rule, not a new component.

## Status colour semantics

One mapping, used by pills, badges, chart series and notifications:

| Status | Token |
|---|---|
| pending | `--warning` |
| processing | `--info` |
| shipped | `--palette-teal` |
| delivered / approved | `--success` |
| returned / failed / flagged | `--danger` |
| suspended | `--text-muted` |

**Colour is never the only signal.** Every status carries a text label too —
required by WCAG 1.4.1 and non-negotiable for a marketplace whose users
include colour-blind buyers.

## Dashboard visual rules

- Flat cards (`box-shadow: none`, 1px border) on a flat surface. Shadow is
  reserved for things that genuinely float: modals, FABs, toasts, the
  notification panel. A shadow on every card over a gradient is what made the
  dashboards feel busy.
- The 3-stop gradient stays on the storefront. `.main--admin` and
  `.main--seller` get a flat `--color-body`.
- KPI values are `--text-charcoal`, not brand blue. A saturated hue at 30px
  across a row of tiles is tiring; reserve colour for meaning.
- Vertical rhythm between dashboard sections is `--space-6`.

## Verify

```bash
node .claude/skills/inclumarket-design/scripts/check-contrast.mjs
```

Resolves every token across all 8 presets plus high-contrast mode, checks every
`color`/`background` pair in `styles/*.css`, and flags:

- pairs below 4.5:1 (3:1 for large text),
- any `color:` referencing a background-only token,
- any `var(--x)` where `--x` is never defined.

Exit code 1 on failure. Wire it into `npm run smoke` when convenient.
