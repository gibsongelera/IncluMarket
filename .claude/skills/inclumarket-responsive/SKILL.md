---
name: inclumarket-responsive
description: Make InclusiveMarket work on phone, tablet, laptop and any screen size, with no CSS framework. Use when asked to "make it responsive", "fix mobile", "it looks broken on my phone", "it overflows", "test different screen sizes", "mobile layout", or when adding any layout CSS. Encodes this repo's hand-written mobile-first breakpoint convention, the table-to-card pattern, and the 12-24px accessibility font scale that breaks fixed pixel offsets.
license: MIT
metadata:
  project: inklumarket-next
  version: "1.0"
---

# InclusiveMarket Responsive Layout

## When to Use This Skill

Any layout CSS, any new page or dashboard section, any report that something
looks wrong on a phone, and any change to the header, a table, or a floating
control.

## There is no framework

No Tailwind. No Vite. No PostCSS pipeline. No CSS-in-JS. ~3,400 lines of
hand-written CSS in `styles/`. **Do not suggest adding a framework, and do not
write utility classes** — they will not exist.

Because nothing enforces the convention for you, the convention below has to be
followed deliberately.

---

## Breakpoints — mobile-first, min-width only

```
base (no query)   320px+    phone portrait. Write here FIRST.
sm                480px+    large phone
md                768px+    tablet portrait / small laptop
lg               1024px+    laptop
xl               1280px+    desktop; --container-max engages
```

Rules:

1. **Every new component gets its 320px styles with no media query at all.**
2. Use `min-width`. The only acceptable `max-width` query is one that undoes a
   `min-width` rule declared in the same file — the table/card swap is the
   single example.
3. **All width media queries live in `styles/responsive.css`**, which is
   imported last. Nowhere else.

History worth knowing: before this convention there were six width media
queries in the entire codebase, four of them landing-page-only. Buyer, seller
and all seven admin pages shared exactly two. That is why almost everything
below needed fixing at once.

---

## Test on two axes, not one

Viewport width **and** the accessibility font scale.

`lib/a11y/prefs.ts` sets `document.documentElement.style.fontSize` anywhere from
**12px to 24px**. Every `rem` grows with it; every hardcoded `px` does not.

**The hard case is 320px wide at 24px font.** That is a real configuration for
this audience, and it is what exposes:

- fixed pixel offsets that assumed an element's height
- flex/grid children that refuse to shrink
- fixed-width canvases and inputs

A layout that survives 320px × 24px survives everything else.

---

## The single most common cause of overflow

Grid and flex children default to `min-width: auto`, which means **they will
not shrink below their content's min-content width** — even when their track
has already collapsed to `1fr`.

At 24px font this made the buyer filter sidebar 351px wide inside a 320px
viewport and pushed the whole page into horizontal scroll.

`responsive.css` applies `min-width: 0` broadly to layout elements inside
`main`, wrapped in `:where()` so it has zero specificity and cannot fight a
deliberate declaration. Tables are deliberately excluded — they want their
intrinsic width and scroll inside `TableWrap`.

If you find new overflow, check this first.

---

## Patterns

### Tables become cards below `md`

`.data-table` carries `min-width: 720px` **only above 768px**. Below that,
`.data-table--cards` turns each row into a stacked card, labelling each cell
from `data-label` via `td::before`.

Always wrap a data table in `components/TableWrap.tsx`, which:
- makes the scroll region focusable and named (WCAG 2.1.1 — without it a
  keyboard user cannot reach the Actions column),
- copies the `<thead>` text into each cell's `data-label` after mount, so the
  labels cannot drift from the headers,
- restates `role="table|row|cell"`, because `display: block` drops the implicit
  table semantics.

```tsx
<TableWrap label="Users">
  <table className="data-table data-table--cards">…</table>
</TableWrap>
```

### Mobile navigation

`components/MobileNav.tsx` renders a bottom tab bar below 768px plus a "More"
sheet (a native `<dialog>`, so focus trapping and Esc are free). `SiteHeader`
hides its link list and user strip at the same breakpoint.

A bottom bar rather than a hamburger, deliberately: targets land in the thumb
arc, every destination is a 56px target with no hidden state, and **labels stay
visible** because icon-only navigation is a known barrier for cognitive
disabilities.

Signed in, the bar is six tabs: four from `lib/nav.ts`, then **Alerts** (the
notification bell, `NotificationBell variant="tab"`), then More. The phone
header is then just the brand and the search (`.header-row--signed-in` hides
its nav); Sign out is in the More sheet. The header's own bell still renders
for 768px and up, so both copies are in the DOM: CSS shows one, and only the
one with client rects polls. The tab's panel opens upward from the bar and
ends above the floating buttons (`bottom: --bottom-inset + --commit-bar-h +
--fab-clearance`: the buttons rise over a product, cart or checkout page's
action bar, so the panel must too).

**Fixed chrome stays under a third of the window.** The sticky header and the
fixed tab bar together: HeaderMetrics makes the header static when its height
plus `--bottom-inset` passes `clientHeight / 3`, and MobileNav takes the bar
out of fixed position (`data-static`, in the page under the header,
`--bottom-inset: 0px`) when the bar alone passes it. Without both, a 68px
header over a two-row bar left 43px of a 320x256 window (400% zoom) and
keyboard focus landed hidden. Check 320x256 and 568x320 at 16 and 24px.

**Labels are never cut.** Each label is `.mobile-nav__label` (one line,
ellipsis as a last resort). After layout, on resize, on a text-size change
and after each navigation, MobileNav checks whether any label overflows and,
if one does, sets `data-rows="2"`: two rows of three. That happens at 24px
text on every phone and on a 320px phone at 16px; a seller's "Dashboard"
(3.44rem) is what the tabs' 0.125rem side padding is sized for at 375px.
Measure a tab-bar change at 320, 360, 375, 414 and 700px with 16 and 24px
text: equal widths, no label cut, and the bell's wrapper is
`display: contents` so its button is a flex item like the others.

### Header row

The header never scrolls the page sideways, at any width or text size:

- **768px and up:** `.header-row` wraps. The search's basis is `11rem` (the
  Search button plus a 4rem input), so when brand, search and nav do not fit
  on one line the nav takes its own line, and `.header-nav`
  (`max-width: 100%`, `justify-content: flex-end`) wraps its links inside it.
  The buyer's nav is 540px at 16px text and 780px at 24px; do not give it
  `flex-shrink: 0` without that `max-width`.
- **Below 768px:** a grid (brand mark, search, nav) and the `header-row`
  container: under 23rem the nav moves to a second row at the end, under
  13rem the Search button drops its icon. Brand, search, nav stays the DOM
  order and the visual order. A media query cannot do this: its rem ignores
  the text-size toolbar. Signed in, the nav is hidden and the grid is
  `auto 1fr` (brand, search): the bell and Sign out live in the tab bar.
- **Panels under the header on phones** (now only the scoped search's
  suggestions; the bell's panel rises from the tab bar) are
  `position: fixed` with `top: 100%` and 8px side insets. That works only because the row has `contain: layout`, which makes
  it their containing block; `container-type` alone does not, and the panel
  opened at the viewport's bottom edge. Check the panel's top against the
  row's bottom, not just that it is visible. A fixed child of a contained
  row adds no scroll area, so each panel is capped to fit:
  `100svh - --header-block - --bottom-inset - --fab-clearance`, but at
  least `min(10rem, the space above the tab bar)` (plain 10rem while the
  header is static), with one scroller (the bell's list loses its own
  360px cap on phones). Each `svh` line follows a `vh` fallback.
- **Never cap an element that is not scrolling itself.** The phone filter
  panel is static when open; a `max-height` with `overflow: visible` drew
  its form over the first products, and taps landed on filter controls.
- **Too tall to stick:** when the header is taller than a third of the
  window (24px text on a landscape phone: 147px of 390), `HeaderMetrics`
  sets `data-header-static` on `<html>`, the header (now `position:
  relative`, so it keeps its z-index) scrolls away with the page, and
  `--header-total` is `0px`. The window is `<html>`'s `clientHeight`, which
  does not change when a phone's toolbar hides on scroll; `innerHeight`
  does, and would flip the header back and forth. The flag also holds
  while focus is in the header (an on-screen keyboard that shrinks the
  window would scroll the search away mid-typing); `focusout` re-measures.
- Measure a header change at 320, 375, 414, 768, 1024 and 1280px with 16 and
  24px text: `scrollWidth === clientWidth`, the input at least 4rem, nothing
  over the bell or Sign out. Measure below 768 at 700px or narrower: an
  overflowing page widens the emulated viewport (767 became 788), so you
  would be measuring the desktop layout.

### Header height and bottom inset

Two measured custom properties, because both genuinely vary:

| Property | Set by | Use for |
|---|---|---|
| `--header-total` | `components/HeaderMetrics.tsx` | `position: sticky; top: calc(var(--header-total) + …)`; `0px` while the header is static |
| `--header-block` | `components/HeaderMetrics.tsx` | The header's height, static or not: the height cap of a panel that opens under it |
| `--bottom-inset` | `components/MobileNav.tsx` | Keeping content and floating buttons clear of the tab bar |

**Never hardcode a pixel offset that depends on an element's height.** The old
`top: 84px` was ~8px wrong at the default font and completely wrong at 24px,
where the header now runs from about 130px to 260px, depending on role and
width.

### Floating controls

One dock, one z-scale. `--z-sticky-bar: 20`, `--z-header: 40`, `--z-fab: 60`,
`--z-alert: 80`, `--z-toast: 100` — never write a bare z-index.

The accessibility and chat buttons used to sit at opposite bottom corners over
a sticky cart bar, so on a 375px cart screen they physically covered both ends
of "Proceed to checkout". Anything pinned to the bottom edge must respect
`--bottom-inset` and step above a sticky action bar when one is present.

### Grids that need no media query

```css
grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
```

Prefer this to a breakpoint whenever the content allows it — `.kpis` uses it and
goes from 1-up to 4-up with no query at all.

---

## Touch targets

- **44×44px minimum** for everything interactive (WCAG 2.5.5 AAA).
- **56px** for tab bar items and floating buttons.
- ≥8px between adjacent targets.
- Inputs are at least 44px tall with `font-size: max(1rem, 16px)` — anything
  under 16px makes iOS Safari zoom the viewport on focus, which strands the
  user mid-form.

AAA rather than the AA 24px minimum, because a large share of this audience has
limited hand mobility or tremor, and the cost here is a few pixels.

---

## Overflow checklist

When something scrolls sideways, check in this order:

1. `min-width: auto` on a flex/grid child (by far the most common)
2. `min-width` on a table
3. Fixed `width` on a canvas, input or image
4. `white-space: nowrap` on nav links or badges
5. Long unbroken strings — product titles, SKUs, emails. Use
   `overflow-wrap: anywhere` as the last resort, but it breaks at any
   letter ("u***.invali/d" at 320px with 24px text). For an email, give it
   break points of its own: `<wbr />` after the "@" and before each "."
   (`<EmailText address={…} />` in `components/EmailText.tsx`, masked or
   not; it adds no character, so copy and screen readers are unchanged)
   For label–value pairs, use `.details-list`: it is its own container and
   stacks the label above the value when narrow, instead of squeezing the
   value into what a `max-content` label column leaves
6. A grid with more fixed columns than the viewport can hold
7. `position: fixed` elements wider than the viewport

---

## Verify

### Static

```bash
node .claude/skills/inclumarket-responsive/scripts/audit-responsive.mjs
```

Flags breakpoints declared outside `responsive.css`, fixed px widths, hardcoded
offsets on sticky/fixed elements, bare z-index values, and fixed `<canvas>`
dimensions. Exit 1 on errors.

### Live

Overflow is objective and worth checking directly. With the app running, drive
it with the `browser-automation` skill (or any headless browser) and evaluate:

```js
// Returns the widest element overflowing the viewport, or null if clean.
(async () => {
  const root = document.documentElement;
  const check = async (px) => {
    root.style.fontSize = px === 24 ? "24px" : "";
    if (px === 24) root.setAttribute("data-font-px", "24");
    else root.removeAttribute("data-font-px");
    await new Promise((r) => setTimeout(r, 400));
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > root.clientWidth + 1 && (!worst || r.width > worst.w)) {
        worst = { w: Math.round(r.width), tag: el.tagName, cls: el.className };
      }
    }
    return { px, overflow: root.scrollWidth > root.clientWidth, worst };
  };
  return { at16: await check(16), at24: await check(24) };
})();
```

Run it at 320, 375, 768, 1024 and 1440. **Both `at16` and `at24` must report
`overflow: false` at every width.** When `worst` is populated it names the
element to fix — nine times out of ten the answer is `min-width: 0`.

Manual ladder — check each at **16px and 24px** root font:

| Width | What to confirm |
|---|---|
| 320 | No horizontal scroll anywhere. Tab bar visible. Tables are cards. |
| 375 | "Proceed to checkout" fully tappable with both floating buttons shown. |
| 768 | Tables revert to tables. Tab bar gone, header links back. |
| 1024 | Two-column dashboards. Sticky panels sit below the header, not under it. |
| 1440 | Body copy capped at `--measure`, not running the full width. |

Also: Tab through every dashboard with no mouse and confirm you can reach every
action, including the Actions column of each table.
