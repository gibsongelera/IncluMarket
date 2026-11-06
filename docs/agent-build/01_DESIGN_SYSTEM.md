# 01: Design system (colours, fonts, palette, components)

One visual language for the storefront, the Seller Centre and the admin
console. It **extends** the existing token system in `styles/tokens.css`
and the rules in `.claude/skills/inclumarket-design/SKILL.md`; it does not
replace them. Every contrast ratio below was measured (WCAG 2.x relative
luminance) on 2026-11-06.

## 1. Direction

- **Storefront** borrows Emox's rhythm: white page, generous whitespace,
  light grey image wells, colour coming from product photos and banners,
  every section a title plus "View all →" plus one row of content.
- **Consoles** borrow Apex's structure: dark sidebar, flat white cards on a
  light grey page, a row of KPI cards with trend and sparkline, chart cards
  in a 12-column grid, quiet tables.
- **Identity** stays InclusiveMarket: blue for action and navigation, brown
  for commerce, neutral surfaces, colour only where it carries meaning. The
  audience includes low-vision and colour-blind users, so legibility beats
  decoration every time.

## 2. Colour palette

### 2.1 Brand

| Token | Hex | One job | Text on it | Measured |
|---|---|---|---|---|
| `--brand-blue` | `#0038A8` | Links, primary buttons, focus ring, current-page markers | `#FFFFFF` | 9.85:1. As text: 9.85:1 on white, 9.18:1 on `#F5F7FA` |
| `--brand-blue-800` | `#00287A` | Header and console sidebar (through `--color-nav`), primary hover | `#FFFFFF` | 13.25:1 |
| `--brand-blue-100` | `#E8EEF9` | Current-item tint, info background, initials avatars | `#0038A8` / `#00287A` / `#212529` | 8.46 / 11.38 / 13.24:1 |
| `--brand-brown` | `#7A4A21` | Prices, sale and discount badges, verified-PWD badge, "needs attention" accent, count badges | `#FFFFFF` | 7.42:1. As text: 7.42:1 on white, 6.92:1 on `#F5F7FA` |
| `--brand-brown-800` | `#5C3618` | Brown hover | `#FFFFFF` | 10.52:1 |
| `--brand-brown-100` | `#F3E8DC` | Brown tint behind brown text | `#7A4A21` / `#212529` | 6.15 / 12.77:1 |
| `--color-footer` | `#4A2C14` | Footer only | `#FFFFFF` | 12.64:1 |
| `--brand-yellow` | `#F5C518` | Rating stars only, always next to a number | `#212529` | 9.46:1 |
| `--danger` (`--brand-red`) | `#C41E3A` | Errors and destructive actions only | `#FFFFFF` | 5.84:1. As text: 5.84:1 on white |

### 2.2 Neutrals

| Token | Hex | Use | Measured |
|---|---|---|---|
| `--text-charcoal` | `#212529` | Body text, headings, **KPI values** | 15.43:1 on white, 14.37:1 on `#F5F7FA` |
| `--text-muted` | `#5A6169` | Secondary text, labels, table headers | 6.27:1 on white, 5.84:1 on `#F5F7FA`, 5.49:1 on `#EEF0F3` |
| `--canvas-white` | `#FFFFFF` | Cards; the storefront home page background | background only |
| `--surface-gray` | `#F5F7FA` | Console page background, product image wells, table header row | background only |
| `--surface-gray-2` | `#EEF0F3` | Category circles, row hover, skeletons | background only |
| `--border` | `#DEE2E6` | Card and divider lines (decorative, 1.30:1) | **not** for form-control outlines (see §8) |

### 2.3 Status (pills, chart segments, notifications)

Colour is never the only signal: every status shows its word too.

| Status | Pill today (`styles/components.css`) | Target | Why change |
|---|---|---|---|
| pending | grey | `--warning-100` fill, `#212529` text, `--warning` border | Matches the skill's semantic table |
| processing | blue tint | unchanged | |
| shipped | **yellow** fill | teal: new `--palette-teal-100: #E0F0F1` fill, `--palette-teal` text (6.56:1) and border | Yellow is reserved for rating stars (tokens.css colour roles) |
| delivered / approved / active / resolved | green tint | unchanged | |
| return_requested | warning tint | unchanged | |
| returned / flagged / rejected / revoked / open | red tint | unchanged | |
| cancelled / suspended / expired / archived | grey | unchanged | Neutral, not an error |

`--warning` (`#B8860B`) measures **3.25:1** on white. That is enough for a
chart segment or a dot (3:1 for graphics), **not** for text. For warning
text use the new `--warning-text: #7A5A00` (6.38:1 on white, 5.81:1 on
`--warning-100`).

### 2.4 Chart series

Defined as aliases so they follow the 8 theme presets and high-contrast
mode automatically.

| Token | Value | Default hex | Typical series |
|---|---|---|---|
| `--chart-1` | `var(--brand-blue)` | `#0038A8` | Revenue, the main series |
| `--chart-2` | `var(--brand-brown)` | `#7A4A21` | Orders, the comparison series |
| `--chart-3` | `var(--palette-teal)` | `#0E5C63` | Third series |
| `--chart-4` | `var(--palette-forest)` | `#0B5C3B` | Fourth series |
| `--chart-5` | `var(--palette-plum)` | `#6B2357` | Fifth series |
| `--chart-6` | `var(--brand-yellow-800)` | `#B8860B` | Sixth series, segments only |

All six are ≥ 3:1 against white. Rules: at most four series in one chart;
order-status donuts use the status mapping above, not the series order;
2px white gaps between donut segments; a legend that lists the value next
to each label; every chart keeps its data-table text alternative.

### 2.5 Console sidebar (Apex-style, dark)

Reuse the themeable nav tokens, so all 8 presets already cover it.

| Part | Value | Measured (default preset) |
|---|---|---|
| Background | `var(--color-nav)` (`#00287A`) | |
| Link and section text | `var(--color-nav-text)` (`#FFFFFF`) | 13.25:1 |
| Section label | same colour, `.75rem`, 700, uppercase, `.04em` tracking. **Do not dim it** with opacity: dimmed text is not checked across presets | |
| Hover | 8% white over nav: `#143985` | white 10.75:1 |
| Current page | 14% white over nav: `#24468D`, plus a 3px left bar in `--color-nav-text`, weight 800, `aria-current="page"` | white 8.99:1 |
| Count badge | `#FFFFFF` fill, `var(--color-nav)` text, pill radius | 13.25:1 |
| Width | `16rem` from lg up | Test at the 24px font setting; collapse below lg as today |

If `check-contrast.mjs` cannot resolve `color-mix()`, add explicit
`--nav-hover` and `--nav-current` tokens instead, with values in **all 8
presets** in `lib/theme.ts` (defaults above).

## 3. Typography

### 3.1 Families (unchanged)

| Role | Family | Source | Why |
|---|---|---|---|
| Body, UI, tables, forms | **Nunito Sans** (`--font-body`) | `next/font/google` in `app/fonts.ts`, self-hosted | Open, rounded shapes that stay legible at small sizes and for low-vision readers |
| Headings, KPI values, prices, brand | **Rubik** (`--font-display`) | same | Sturdy, slightly rounded; its figures read well in big numbers |
| Code, IDs | `--font-mono` (system) | | Order numbers and reference codes |

Do not add Geist (Apex's font) or any third family.

### 3.2 Scale

All sizes are `rem`, so they follow the 12–24px accessibility setting.
Pixel values below are at the 16px default.

| Role | Token / size | Weight | Family | Notes |
|---|---|---|---|---|
| Page title (h1) | `--step-4` (30px) | 800 | Rubik | One per page |
| Page description | `--step-0` (16px) | 400 | Nunito Sans | `--text-muted`, max `--measure` |
| Section title (h2) | `--step-3` (24px) | 800 | Rubik | Storefront sections, console sections |
| Card title | `--step-1` (18px) | 700 | Rubik | Headings inside cards; still an `h2`/`h3` in the outline |
| Card subtitle | `.875rem` (14px) | 400 | Nunito Sans | `--text-muted` |
| KPI value | `--step-4` (30px) | 800 | Rubik | `--text-charcoal`, `tabular-nums` |
| KPI label | `.875rem` | 600 | Nunito Sans | `--text-muted` |
| Trend | `.875rem` | 700 | Nunito Sans | Arrow icon + words, see §6.1 |
| Body, table cells, inputs | `--step-0` (16px) | 400 / 600 | Nunito Sans | Line height 1.5 |
| Table header | `.875rem` | 700 | Nunito Sans | `--text-muted`, sentence case (no uppercase) |
| Product title (card) | `.9375rem` (15px) | 600 | Nunito Sans | Clamp to 2 lines |
| Price (card) | `--step-1` | 700 | Rubik | `--brand-brown`, `tabular-nums` |
| Struck-out price, "sold" count | `.875rem` | 400 | Nunito Sans | `--text-muted` |
| Small print minimum | `.875rem` | | | Nothing smaller except the sidebar section label |

Rules: at most three sizes on one card; `font-variant-numeric: tabular-nums`
on every money, count and KPI value; headings line height 1.2; allow 30%
text growth for Filipino copy (the proposal promises English and Filipino).

## 4. Space, radius, depth, motion

Use the existing scales only; no bare literals.

| Scale | Tokens | Use in this build |
|---|---|---|
| Space | `--space-1` … `--space-8` | Card padding `--space-4` on phones, `--space-5` from lg; gap inside grids `--space-4`; between console sections `--space-6`; between storefront sections `--space-7` |
| Radius | `--radius-sm` 6px (buttons, inputs), `--radius-md` 10px (cards, image wells; same as Apex's `.625rem`), `--radius-lg` 14px (hero banners), `999px` (pills, avatars, category circles) |
| Depth | Consoles flat: 1px `--border`, no shadow. Storefront product cards `--shadow-sm`, `--shadow-md` + 2px lift on hover. Shadows otherwise only on things that float (dialogs, menus, toasts, FABs) |
| Motion | `--dur-1/2/3` with `--ease-out`. Nothing over 300ms, nothing that bounces, no staggered entrances. Both reduced-motion switches null it all |
| Layering | `--z-*` tokens only |

## 5. Layout grids

- **Console content:** a 12-column grid from lg (`.dash-grid`), cards span 8
  + 4 or 6 + 6 or 12; one column below lg. Optional `--console-max: 90rem`
  so a dashboard with a sidebar is not squeezed into the 1200px storefront
  container.
- **KPI row:** 1 column below 480px, 2 at md, 4 at lg.
- **Storefront:** unchanged product grid (2 / 3 / 4 / 5 columns, one
  definition in `responsive.css`).
- All new width queries go in `styles/responsive.css`.

## 6. Component anatomy

### 6.1 KPI card, Apex pattern (evolved from today's `.kpi` and `.overview-tile`)

```
┌──────────────────────────────────────┐
│ Gross sales (30 days)          [icon]│  label: .875rem 600 muted · icon tile 2.5rem,
│ ₱128,430                             │  -100 tint fill, icon in role colour, aria-hidden
│ ▲ 18.2% vs previous 30 days          │  value: Rubik 800 --step-4 charcoal tabular
│ ╱╲__╱‾‾╲__╱‾‾‾‾  (sparkline)         │  trend: icon + words, coloured by good/bad
└──────────────────────────────────────┘  sparkline: canvas ~3rem tall, --chart-1, aria-hidden
```

- White, 1px `--border`, `--radius-md`, no shadow. The whole card is a link
  to the list behind the number, with the normal focus ring.
- Trend colour follows **good or bad, not up or down**: a falling refund
  rate is good (`--success`). Always show the arrow icon and the words ("up
  18.2% vs previous 30 days"), never colour alone. When the previous period
  is 0, show "New" instead of a percentage.
- Sparkline summary goes in visually hidden text ("Daily sales, lowest
  ₱0, highest ₱6,000").
- When a count is unavailable (migration missing), show "—" and "Needs a
  database update", as `lib/admin-overview.ts` already does.

### 6.2 Chart card (the existing `.chart-card`, extended)

Header: card title + subtitle on the left, `components/Tabs.tsx` on the
right when the chart switches series (Revenue · Orders). Body: `Chart`.
Footer: the existing data-table alternative. Donut: centre label (total)
and a legend list with values; add a `donut` kind to `lib/charts.ts`
rather than a new library.

### 6.3 Data table

Header row `--surface-gray`, `.875rem` 700 muted; rows at least 3rem tall;
row hover `--surface-gray`; numbers right-aligned and tabular; status as a
pill. Identity cell: 2rem initials avatar (`--brand-blue-100` fill,
`--brand-blue-800` text, 11.38:1), name, and a muted second line. Row
actions in an "Actions" menu button that works by keyboard. Status tabs
with counts above the table; result count, search, Export and pagination
(10 / 25 / 50) around it. Phones: table→card through `TableWrap`.

### 6.4 Section header

`h2` on the left (Rubik 800 `--step-3`), "View all →" on the right
(`--brand-blue`, 600) with an accessible name such as "View all deals".

### 6.5 Storefront pieces (Emox pattern)

| Piece | Spec |
|---|---|
| Product card | Unchanged anatomy from the client revision: 1:1 image in a `--surface-gray` well, wishlist heart (2.75rem target) top-right on a white circle, 2-line title, stars + count, brown price, struck price and brown "−20%" badge during a sale, "sold" count, verified-PWD badge. Equal heights in a row. |
| Category tile | 5rem circle in `--surface-gray-2`, category icon 1.75rem in `--brand-blue-800` (11.61:1), name below (`.9375rem` 600), product count muted. Icons, not photos: categories have no images (`lib/category-icons.ts`). |
| Hero banner | `--radius-lg`, image from Admin → Banners. Text baked into a banner image must also be in its alt text. No autoplay; if it rotates, a visible Pause, at least 5s per slide, pause on hover and focus, none under reduced motion. Previous / next buttons with names. |
| Side promo tile | Same radius; a flash-sale or featured-seller promo built from data, not an uploaded image. |
| Shop store card | White, 1px border, `--radius-md`; 3rem round logo, shop name 700, verified-PWD badge, "n products" muted. |
| Rail | Section header + one horizontally scrollable row with previous/next buttons from md up; wraps to a 2-column grid on phones. |

### 6.6 Icons

`components/Icon.tsx` (inline SVG) or FontAwesome solid. Apex uses Lucide;
do not add it. No emoji as icons. Icons are decorative next to a visible
label (`aria-hidden`); an icon-only button needs an accessible name.

## 7. Accessibility checks for every new piece

- Text ≥ 4.5:1 (≥ 3:1 at 24px+ or 18.66px bold); graphics and control
  outlines ≥ 3:1.
- Works at 12px and 24px root size, 200% zoom, 320px width, high contrast,
  reduced motion, keyboard only, NVDA.
- Targets ≥ 24×24 CSS px; primary actions ≥ 44px.
- Focus visible and not hidden under the header, a sticky bar or a FAB.

## 8. Changes to make (Phase 1)

| # | Change | File |
|---|---|---|
| D-01 | Add `--chart-1` … `--chart-6` as aliases (§2.4) | `styles/tokens.css` |
| D-02 | Add `--warning-text: #7A5A00`; use it wherever warning-coloured text appears | `styles/tokens.css`, call sites |
| D-03 | Add `--palette-teal-100: #E0F0F1`; restyle `.pill--shipped` to teal; restyle `.pill--pending` to the warning tint | `styles/tokens.css`, `styles/components.css` |
| D-04 | Add `--border-control: #7C838B` (3.83:1 on white) and use it for `input`, `select`, `textarea` borders. Today they use `--border` at 1.30:1, below the 3:1 that WCAG 1.4.11 needs for a field's outline. High contrast keeps `#000` | `styles/tokens.css`, `styles/components.css` |
| D-05 | Console sidebar restyle (§2.5) with count badges for the queue items | `styles/layout.css`, `components/ConsoleNav.tsx` |
| D-06 | One KPI card: evolve the existing seller `.kpi` and admin `.overview-tile` into the single pattern of §6.1 (one class family, not a third one). Extend the existing `.chart-card` and `.chart-grid` (in `layout.css`) rather than adding new ones; add `.dash-grid` and the section header. KPI values to `--text-charcoal` (today `.kpi__value`, `.overview-tile__count` and `.todo-list__count` are brand blue, against the skill's own rule) | `styles/components.css`, `styles/layout.css`, `styles/responsive.css` |
| D-07 | `donut` and `sparkline` in the canvas chart helpers, each with a text alternative and the label font that follows the accessibility scale | `lib/charts.ts`, `components/Chart.tsx`, a small `components/Sparkline.tsx` |
| D-08 | Update the `inclumarket-design` skill with everything above | `.claude/skills/inclumarket-design/SKILL.md` |

Only D-05's nav-state colours could need values in the 8 presets (if
`color-mix()` is not usable). Everything else is either an alias of a
themed token or a fixed neutral.

## 9. Don't

- Purple or blue gradients, glassmorphism, glows, neon shadows, gradient text.
- Shadows on console cards; cards inside cards.
- Saturated colour for KPI numbers; colour as the only signal.
- Yellow for anything except rating stars.
- Invented statistics, fake reviews, placeholder people, lorem ipsum.
- Calling recommendations "AI" unless they are (see `05`).
