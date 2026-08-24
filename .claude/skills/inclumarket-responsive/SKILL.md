---
name: inclumarket-responsive
description: Make IncluMarket work on phone, tablet, laptop and any screen size, with no CSS framework. Use when asked to "make it responsive", "fix mobile", "it looks broken on my phone", "it overflows", "test different screen sizes", "mobile layout", or when adding any layout CSS. Encodes this repo's hand-written mobile-first breakpoint convention, the table-to-card pattern, and the 12-24px accessibility font scale that breaks fixed pixel offsets.
license: MIT
metadata:
  project: inklumarket-next
  version: "1.0"
---

# IncluMarket Responsive Layout

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

### Header height and bottom inset

Two measured custom properties, because both genuinely vary:

| Property | Set by | Use for |
|---|---|---|
| `--header-total` | `components/HeaderMetrics.tsx` | `position: sticky; top: calc(var(--header-total) + …)` |
| `--bottom-inset` | `components/MobileNav.tsx` | Keeping content and floating buttons clear of the tab bar |

**Never hardcode a pixel offset that depends on an element's height.** The old
`top: 84px` was ~8px wrong at the default font and completely wrong at 24px,
where the header exceeds 120px.

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
   `overflow-wrap: anywhere`
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
