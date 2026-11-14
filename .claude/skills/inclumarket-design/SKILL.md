---
name: inclumarket-design
description: InclusiveMarket's design-token system, CSS layer order and visual conventions. Use when asked to "change the styling", "add a component", "fix the colors", "make it look better", "match the design", "theme it", or when editing anything under styles/ or adding a className. Encodes project-specific footguns that generic design-system skills do not know about.
license: MIT
metadata:
  project: inklumarket-next
  version: "1.1"
---

# InclusiveMarket Design System

## When to Use This Skill

Any edit to `styles/*.css`, any new `className`, any inline `style={{}}`, any
question about colour, spacing, or theming in this repo.

**Not** for general design theory — for that, defer to `design:design-system`
and `product-skills:ui-design-system`. This skill only covers what is specific
to this codebase.

## The one-paragraph orientation

There is **no Tailwind, no CSS framework, and no PostCSS pipeline**. The UI is
~5,900 lines of hand-written CSS in `styles/`, plus a design-token layer and a
runtime theming system that injects CSS custom properties into the document
head on every request. Do not suggest adding a framework. There is no chart
library either: charts are Canvas 2D in `lib/charts.ts`.

## Layer order is load-bearing

`app/layout.tsx` imports these in exactly this order. Later files can override
earlier ones without `!important`; that is the mechanism, not an accident.

| File | Owns |
|---|---|
| `tokens.css` | Custom properties only. No selectors beyond `:root` and its state variants. |
| `base.css` | Reset, typography, `.sr-only`, `.skip-link`, focus ring, toasts. |
| `components.css` | `.btn`, `.badge`, `.pill`, `.card`, `.data-table`, `.tabs`, `.modal`, form controls, `.kpi`, the chart legend and donut, the a11y and chat widgets. |
| `layout.css` | Page shells: header, footer, buyer feed, cart, checkout, the console (sidebar, `.console__content`, `.section-head`, `.dash-grid`, `.chart-grid`, `.chart-card`). |
| `shopee.css` | Shopee-pattern additions: density, category strip, sticky cart bar. |
| `landing.css` | Landing and auth pages only. |
| `responsive.css` | **Every width media query and container query**, except four older width queries that `landing.css` still keeps for its own pages. Imported last. |

**Rule:** a new width media query or container query goes in `responsive.css`,
nowhere else. See the `inclumarket-responsive` skill.

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

Things to know:

- The selector is `html:root` (specificity 0,1,1) so it outranks `tokens.css`'s
  plain `:root` (0,1,0) regardless of import order, while
  `:root[data-contrast="high"]` (0,2,0) still wins for high-contrast mode.
- **A new themeable colour must be added to all 8 presets**, not just `:root`,
  or it will be undefined under 7 of them.
- `themeVarsToCss()` filters every name and value before emitting. Values come
  from the database and land in raw CSS, so an unfiltered `</style>` payload
  would be stored XSS. Do not remove that filter.
- Status colours are deliberately **not** themed. `--status-*` and the teal
  pill pair are fixed hex in `tokens.css` (high contrast darkens them), so
  Processing reads blue and Failed red under every event theme. The checker's
  pill guard enforces it.

## The accessibility font scale changes layout maths

`lib/a11y/prefs.ts` sets `document.documentElement.style.fontSize` anywhere
between **12px and 24px**. Every `rem` scales with it; every hardcoded `px`
does not.

**Never write a px offset that depends on an element's height.** `top: 84px` on
the sticky filter panel was wrong at 16px and badly wrong at 24px. Use `rem`,
`em`, or the measured `--header-total` / `--bottom-inset` properties.

- **Buttons do not inherit the font.** A `<button>` keeps the browser's
  13.33px unless its rule says `font: inherit`, and then it ignores the
  12–24px scale (the review stars shipped at 13px that way). There is no
  global reset; every button style sets it.
- Size dashboard rows with `@container console (… rem)`, not the window: the
  sidebar and the 24px setting both narrow the content column.
- Canvas text follows the scale too: chart labels are `LABEL_EM` (.875) × the
  root font, in the body's font, and every chart redraws when the setting
  changes (`watchRedraw`).

## Scales

| Scale | Tokens | Use |
|---|---|---|
| Type | `--step-0` … `--step-5` | Headings map h1→`--step-4`, h2→`--step-3`, h3→`--step-2`. |
| Space | `--space-1` (0.25rem) … `--space-8` (4rem) | Padding, gaps, margins. Do not write bare `.35rem`. |
| Radius | `--radius-xs/sm/md/lg` | |
| Measure | `--measure` (68ch) | Cap on body copy. Admin text used to run the full 1200px. |
| Depth | `--z-sticky-bar` 20, `--z-header` 40, `--z-fab` 60, `--z-alert` 80, `--z-toast` 100 | Never write a bare z-index. |
| Floating buttons | `--fab-size` (56px), `--fab-clearance` (size + 2 × `--space-3`) | Room the floating buttons need; keep sticky bars and the sidebar's foot clear of it. |

## Tokens the dashboards added

| Token | Default | Use |
|---|---|---|
| `--border-control` | `#7C838B` (high contrast `#000`) | The 3:1 outline of fields, selects, checkboxes and the controls drawn with them (1.4.11). `--border` is for cards and dividers only. |
| `--warning-text` | `#7A5A00` | Warning text (6.38:1 on white). `--warning` (`#B8860B`, 3.25:1) is for borders, dots and chart segments only. |
| `--palette-teal-100` | `#E0F0F1` | The shipped pill's fill. |
| `--status-text`, `--status-neutral`, `--status-info(-100)`, `--status-ok(-100)`, `--status-warn(-100)`, `--status-error`, `--status-error-text`, `--status-error-100` | fixed hex | Pills, order-status chart segments, KPI trends. Not themed. `--status-warn` is for borders and segments only. |
| `--star-filled`, `--star-edge`, `--star-bar` | gold, `--brand-yellow-800`, the edge 25% darker | Rating stars: the edge carries the 3:1, the fill is decoration; `--star-bar` fills the rating breakdown bars. |
| `--chart-1` … `--chart-6` | brand blue, brown, teal, forest, plum, yellow-800 | Lines take the first four in order, at most four per chart; segments with no status take all six. Each is 3:1 on a card; `--chart-6` is never text. |
| `--focus-ring-nav` | 3px solid `--color-nav-text` | The ring on the dark sidebar. |
| `--console-max` | `90rem` | The Seller Centre and admin console width, and the header and footer on console pages. Storefront pages keep `--container-max`. |

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
| `components/Chart.tsx` | A canvas (`role="img"`, named, no figures) drawn by `lib/charts.ts`; a donut's total and legend as HTML; the same figures under "View as table". |
| `components/Sparkline.tsx` | A KPI's recent values as a 2px line; the canvas is `aria-hidden`, the words come from the caller. |
| `components/KpiCard.tsx` | One dashboard figure as a link: label, icon tile, value, trend (`lib/kpi.ts`), and an optional sparkline with its words. |
| `components/ConsoleNav.tsx` | The console sidebar: sections, `aria-current="page"`, count badges with "n waiting" for screen readers. |
| `components/StarInput.tsx` | The rating input: a radio group with arrow keys and a visible "n of 5". |
| `components/MobileNav.tsx` | Bottom tab bar and More sheet. |
| `components/Pill.tsx` | Status colour semantics in one place. |

Other conventions:

- Modals are native `<dialog>`, so focus trapping and Esc come free.
- Icons come from `components/Icon.tsx`, a hand-maintained inline SVG set.
  Add to `ICONS` rather than importing a library.
- Money, dates and email masking go through `lib/format.ts`. Money in a KPI
  tile is whole pesos (`moneyWhole()`); lists, receipts and balances keep
  `money()`.
- Toasts fire a `window` CustomEvent — see `lib/toast.ts`.
- A new status value gets a new `.pill--<value>` rule, not a new component.

## Status colour semantics

One mapping, used by pills, the order-status donut and notifications, in
fixed tokens:

| Family | Statuses (`.pill--<status>`) | Fill | Text | Border |
|---|---|---|---|---|
| Warning | pending, return_requested | `--status-warn-100` | `--status-text` | `--status-warn` |
| Info | processing, in_progress, submitted | `--status-info-100` | `--status-info` | `--status-info` |
| Teal | shipped | `--palette-teal-100` | `--palette-teal` | `--palette-teal` |
| OK | delivered, approved, active, resolved, paid | `--status-ok-100` | `--status-ok` | `--status-ok` |
| Error | returned, failed, flagged, rejected, revoked, open | `--status-error-100` | `--status-error-text` | `--status-error` |
| Neutral | cancelled, expired, suspended, unpaid, refunded | `--surface-gray-2` | `--status-text` | `--status-neutral` |
| Archived | archived | `--surface-gray-2` | `--status-neutral` | `--border` |

The donut colours a segment by its order status (`STATUS_TOKENS` in
`lib/charts.ts`): pending `--status-warn`, processing `--status-info`,
shipped `--palette-teal`, delivered `--status-ok`, returned `--status-error`,
cancelled and anything unknown `--status-neutral`. Return requested is
`--palette-plum` there, because pending already has the warning colour. Each
is required at 3:1 on a card in every scenario (`REQUIRED_PAIRS`).

**Colour is never the only signal.** Every status carries a text label too —
required by WCAG 1.4.1 and non-negotiable for a marketplace whose users
include colour-blind buyers. In a chart that means the legend's words, and a
dash pattern per line (`SERIES_DASHES`).

## Dashboard visual rules

- Flat cards (`box-shadow: none`, 1px border) on a flat surface. Shadow is
  reserved for things that genuinely float: modals, FABs, toasts, the
  notification panel. A shadow on every card over a gradient is what made the
  dashboards feel busy.
- The 3-stop gradient stays on the storefront. `.main--admin` and
  `.main--seller` get a flat `--color-body`.
- Vertical rhythm between dashboard sections is `--space-6`.
- **Container queries.** `.console__content` is the only container
  (`console`, inline size); nothing `position: fixed` may render inside it.
  Thresholds are rem of content: KPI row one column, two from 35rem, one row
  of equal columns from 58rem (three to a row for five or more), compact tile
  below 15rem; `.dash-grid` 12 columns from 58rem with
  `.span-8/-6/-4/-12`; `.chart-grid` two from 40rem; table cards put each
  label above its value below 18rem.
- **Sidebar** (lg up): a `--color-nav` panel, text `--color-nav-text`; hover
  mixes 8% and the current page 14% of the text colour into the nav, and the
  current page adds a 3px bar and weight 800. The badge is the inverse pill.
  Width `min(16rem, 25vw)`; sticky, it scrolls itself with its own focus
  ring. Section labels are never dimmed.
- **KPI card:** white, 1px border, no shadow; label .875rem 600 muted; value
  Rubik 800 `--step-4` in `--text-charcoal` (not brand blue: a saturated hue
  at that size across a row is tiring), even digits, whole pesos; the trend
  is an icon plus words ending "(better)" or "(worse)", so colour is never
  the only cue, coloured by good or bad (`--status-ok`,
  `--status-error-text`, `--text-muted`); the icon tile is 2.5rem, tint and
  role colour in one rule; `.kpi--queue.is-waiting` has the 4px brown bar; a
  sparkline sits in the 3rem `.kpi__spark` slot at the foot.
- **Chart card:** `.chart-card__head` (title Rubik 700 `--step-1`,
  `.chart-card__subtitle`, a Tabs slot that wraps under), the chart, the
  "View as table" footer. The canvas follows its CSS box (line and bar 5:2,
  at least 10rem tall; `hbar` sets its own height from its rows), so never
  size one inline.
  - Labels are at least .875 × the root font, in the body font; x labels are
    thinned by their measured width and the left pad follows the widest tick,
    so nothing overlaps or is cut at 320px with 24px text.
  - Lines take `--chart-1` … `--chart-4` in order, each with its own dash.
  - Donut: a ring with 2px card-white gaps, the total as HTML in the hole
    ("13 orders"), an HTML legend that wraps under the ring on a narrow card
    (swatch `aria-hidden`, the status word, the count, the share). Shares are
    the nearest whole percent, so equal counts read the same; a count that
    rounds to 0% says "under 1%". A zero total shows the empty state, not an
    empty ring.
  - Horizontal bars: the label on its own line above each bar (two lines,
    then an ellipsis), the value at the bar's end.
- **Section head:** `.section-head` h2 Rubik 800 `--step-3` and a 2.75rem
  "View all" link named for what it lists, only where the destination exists.
- **Tables:** header `--surface-gray` with .875rem 700 `--text-muted` (one
  rule); rows at least 3rem; stripes half `--surface-gray`; `.num`
  right-aligned with even digits (left in cards); `.cell-identity` with a 2rem
  `.avatar` (`--brand-blue-100` / `--brand-blue-800`). Phones:
  `.data-table--cards` through `TableWrap`.

## Verify

```bash
node .claude/skills/inclumarket-design/scripts/check-contrast.mjs
```

Resolves every token in 16 scenarios (8 presets, high contrast off and on)
and flags, with exit code 1:

- a `color`/`background` pair in one rule below 4.5:1 (3:1 for large text) —
  pairs are only taken within a rule, so put text and its fill together;
- a `REQUIRED_PAIRS` entry below its ratio (colours that never share a rule:
  chart segments, swatches, control borders on a card);
- a focus ring below 3:1 against the background its rule sits on;
- any `color:` referencing a background-only token, and any `var(--x)` where
  `--x` is never defined;
- the pill guard: a `.pill--*` rule that uses a themed token.

`--table` also lists the lowest ratio of every required pair and where it
is, and the pairs it could not measure (a translucent background or a
gradient depends on what is behind it). It runs in `npm run verify`. After
changing anything in `.claude/skills/`, re-sync the copy the other agents
read:

```bash
cp -r .claude/skills/* .agents/skills/ && diff -rq .claude/skills .agents/skills
```
