# InclusiveMarket: dashboard and storefront build prompt

> **How to use:** open Claude Code in `C:\xampp\htdocs\Capstonepaul` and send
> `Read docs/agent-build/00_MASTER_PROMPT.md and follow it exactly.`
> Everything below the line is the prompt. It was written against the working
> tree on 2026-11-06 (`HEAD` `e06a60f`). Where this file and the code
> disagree, trust the code and say so in the plan.

---

You are working on **InclusiveMarket**, a marketplace where persons with
disabilities (PWD) trained at AVRC Region IX sell what they make, and anyone
can buy. It is a client project and a capstone that advisers grade against
its proposal (`documents/inklutrack_proposal.docx`). Treat it as production
software.

Your job is to bring three surfaces up to the quality of two references,
**without rebuilding what already works**:

| Surface | Routes | Reference | Spec |
|---|---|---|---|
| Admin console (AVRC staff) | `/admin/*` | Apex eCommerce dashboard (apex-shadcn.dashboardpack.com) | `03_ADMIN_DASHBOARD.md` |
| Seller Centre (PWD trainees) | `/seller/*` | Apex, seller-scoped | `04_SELLER_DASHBOARD.md` |
| Storefront and buyer area | `/home`, `/search`, `/shop/*`, `/buyer/*`, `/account` | Emox eCommerce landing page (Dribbble shot 26100488) | `05_BUYER_STOREFRONT.md` |

Colours, fonts and components for all three come from `01_DESIGN_SYSTEM.md`.
Architecture constraints come from `02_ARCHITECTURE.md`. Skills and
subagents come from `06_SKILLS_AND_AGENTS.md`.

## 0. Mode and ground rules

**Stage A: plan only.** Do not create, edit, move or delete files. Do not run
migrations or `npm run build`. You may read files, run `git status`,
`git diff`, `git log`, `npx tsc --noEmit` and `npm run verify` (it does not
build), and use the dev server from `.claude/launch.json` read-only for
screenshots. Produce the plan in the format of §9, then **stop and wait**
until I reply `APPROVED` (possibly with edits).

**Stage B: build (only after `APPROVED`).** Work through the approved steps
in order. Before the first step, commit any uncommitted work so nothing is
lost. After every step, `npx tsc --noEmit` and `npm run verify` must exit 0;
then commit with the step id in the message. If a step turns up something
the plan did not anticipate, stop and tell me instead of widening scope.

**Non-negotiables.** `CLAUDE.md` is the authority and overrides your
defaults. The ones most likely to be broken by this work:

- **No Tailwind, no shadcn/ui, no CSS-in-JS, no UI kit, no chart library, no
  animation library.** Apex is built on all of these. Rebuild its layout in
  the hand-written CSS in `styles/`, in the existing layer order. Do not copy
  Apex source, markup, icons or images: it is a paid, licensed template.
- Next.js 15 App Router. Pages are async Server Components with
  `export const dynamic = "force-dynamic"`.
- Reads go through `server-only` modules (`lib/data.ts`, `lib/storefront.ts`,
  `lib/admin-overview.ts`, `lib/finance.ts`, …) and reach client components
  as small DTOs, never raw rows.
- Mutations are server actions in `lib/actions/*.ts`: role check first,
  return `{ ok, error }`, never throw, audit-log, `revalidatePath`. **Every
  export of a `"use server"` module is a public HTTP endpoint.** This build
  should need few or no new actions; if it does, run the
  `inclumarket-security-audit` checklist on each.
- New schema only in a new numbered migration (`0025_*.sql` onward) with its
  RLS and a rollback in `supabase/rollback/`. Never edit an applied
  migration. Prefer no schema change at all: every widget in the specs can
  be built from existing tables.
- The accessibility toolbar scales the root font from 12px to 24px. Use
  `rem`. Never write a `px` offset that depends on an element's height
  (use `--header-total`, `--bottom-inset`, `--commit-bar-h`).
- Every width media query goes in `styles/responsive.css`, nowhere else.
- Native `<dialog>` for modals, `lib/toast.ts` for toasts,
  `components/Icon.tsx` or FontAwesome solid for icons. No emoji as icons.
- Charts use `components/Chart.tsx` and `lib/charts.ts` (canvas plus a data
  table alternative). Extend them; do not add Recharts or Chart.js.
- One `.next`, one process: never `npm run build` while `npm run dev` runs;
  never start a second dev server.
- A new dependency only when a requirement cannot be met without it. Name the
  requirement and the alternative you rejected, as an ADR in the plan.

## 1. Read before planning

| Source | Why |
|---|---|
| `CLAUDE.md`, `README.md` | Stack, conventions, routes. |
| `docs/agent-build/01`–`06` | The specs for this build. |
| `docs/REBUILD_PLAN.md` | Phases already shipped, and "Open items that need the user". **Most features exist. Improve them; do not rebuild them.** |
| `docs/prompts/CLIENT_REVISION_PROMPT.md` §5–§7 | Role completeness benchmark and design direction the client already approved. This build continues it. |
| `docs/SYSTEM_DIAGRAMS.md`, `docs/erd.md` | Use cases, requirements, state machines, tables. |
| `.claude/skills/*/SKILL.md` | Project footguns: `inclumarket-design`, `inclumarket-responsive`, `inclumarket-security-audit`, `inclumarket-feature-review`. |
| `lib/nav.ts` | The one source of truth for header, tab bar and console sidebar navigation. |
| `styles/tokens.css`, `lib/theme.ts` | Tokens and the 8 runtime theme presets. |
| `supabase/migrations/0001`–`0024` | Ground truth for columns and constraints. |

## 2. What "done" means

- **Admin** opens `/admin` and sees, in this order: what needs doing now (the
  existing queue tiles), four KPI cards with trend and sparkline, sales over
  time, order status split, top products, sales by category, recent orders.
  Every number links to the list behind it.
- **Seller** opens `/seller/dashboard` and sees verification status and setup
  steps while incomplete, the to-do counters, four KPI cards, 12-week sales,
  order status split, top products, low stock, recent orders and latest
  reviews, in plain language.
- **Buyer or guest** opens `/home` and gets the Emox rhythm: search-first
  header, hero banner with side promo, round category tiles, today's deals,
  featured PWD shops, category bestseller rails, picked-for-you, then the
  full grid. A signed-in buyer opening `/account` sees a purchases dashboard
  (To pay, To ship, To receive, …) instead of only account details.
- All three surfaces share one palette, one type scale, one card style, one
  table style and one KPI style, defined in `01_DESIGN_SYSTEM.md`.
- `npm run verify` and `npx tsc --noEmit` exit 0. Every redesigned page works
  at 320px, 375px, 768px and 1280px, at the 24px font setting, in
  high-contrast mode, with reduced motion, and by keyboard alone.

## 3. Phase 0: skills and subagents

Follow `06_SKILLS_AND_AGENTS.md`. In Stage A, report what you found and what
you propose to keep, update, install, remove and create. In Stage B:

- Create the four subagents in `.claude/agents/` from the definitions given.
- Update the stale "Known gaps" section of `inclumarket-feature-review`.
- Install only skills from the "Install" list, and only after confirming the
  exact name in the marketplace listing.
- Delete nothing outside this repository without asking me first.
- `.agents/skills/` is a git-ignored mirror for another agent tool and is
  out of date. Ask me in the plan whether to re-sync it from
  `.claude/skills/` (default) or delete it.

## 4. Phase 1: design tokens and shared components

Follow `01_DESIGN_SYSTEM.md` §8 ("Changes to make"). In short:

- Add the chart series tokens and `--warning-text` to `styles/tokens.css`
  (and the high-contrast block).
- Restyle the console sidebar to the deep `--color-nav` surface, with count
  badges on queue items. Reuse `--color-nav` / `--color-nav-text` so all 8
  presets already cover it.
- One KPI card pattern with label, value, trend and a sparkline, evolved
  from the seller's existing `.kpi` and the admin's `.overview-tile` so
  there is one class family, not three. KPI values are `--text-charcoal`,
  not brand blue.
- Extend the existing `.chart-card` / `.chart-grid`; one data table look;
  one section header ("Title" + "View all →").
- Add a donut option and a sparkline to `lib/charts.ts`, each with a text
  alternative.

Run `check-contrast.mjs` after this phase. It must pass under all 8 presets
and high contrast.

## 5. Phase 2: admin console

Follow `03_ADMIN_DASHBOARD.md`. Put the new aggregates in a new
`server-only` module (proposed: `lib/admin-analytics.ts`) and keep
`lib/admin-overview.ts` for the queue counts. Then apply the list pattern
(status tabs with counts, search, export, pagination, table→card on phones)
to `/admin/orders`, `/admin/products` and `/admin/users`, improving the
existing client components rather than replacing them.

## 6. Phase 3: Seller Centre

Follow `04_SELLER_DASHBOARD.md`. Move the aggregation that currently lives
inline in `app/seller/dashboard/page.tsx` into a reusable `server-only`
helper, then lay the page out on the shared components. Apply the same list
pattern to `/seller/orders` and `/seller/products`.

## 7. Phase 4: storefront and buyer dashboard

Follow `05_BUYER_STOREFRONT.md`. Reorder and restyle `/home` to the Emox
section order using the existing components (`BannerStrip`, `CategoryChips`,
`FlashSaleStrip`, `RecommendationRail`, `StorefrontGrid`, …). Then turn the
buyer's `/account` overview into a purchases dashboard.

## 8. Phase 5: end check

- `npx tsc --noEmit` and `npm run verify`: both exit 0.
- Use the `qa-verifier` subagent to drive the real app (buyer, seller and
  admin demo accounts from `npm run provision-users`) and click every control
  on every redesigned page. `npm run smoke` alone is not evidence: it greps
  files.
- After-screenshots at 375, 768 and 1280px for every redesigned page, next
  to the before-screenshots from Stage A.
- Update `README.md`, `docs/REBUILD_PLAN.md` (new section for this build) and
  the `inclumarket-design` skill so the documentation matches the code.

## 9. Stage A output format

1. **Findings**: what exists today for each surface, with file paths, and
   anything in `docs/agent-build/` that turned out to be wrong.
2. **ADRs**: one per decision that adds a dependency, a migration, a route
   handler or a new shared component. Context, decision, alternatives,
   consequences.
3. **Steps**: a numbered table, ids `P0-01` … `P5-nn`, columns: id, files,
   change, why (link to the spec section), risk, how it is verified. Each
   step small enough to commit on its own.
4. **Before-screenshots** at 375, 768 and 1280px of `/home`, `/account`,
   `/seller/dashboard`, `/admin`, `/admin/orders`. Saving these PNGs under
   `docs/screenshots/before-dashboards/` is the one file write Stage A
   allows. Link them from the plan.
5. **Questions**: only ones whose answer changes what you build. Give a
   default for each.

## 10. Out of scope

Do not do these, even if a reference shows them: dark mode; RTL; extra
languages; Apex's CRM, HR, Academy, Logistics, SaaS, Marketing, Project and
AI dashboards; mail, files, kanban and calendar apps; role and permission
editors; layout and density switchers; a command palette; microservices,
message brokers, Redis or a search engine; renaming routes; changing the
palette away from blue and brown.

## 11. Stop and ask when

- A widget in a spec needs a column or table that does not exist.
- A change would break the 24px font setting, high-contrast mode or the
  contrast checker, and the spec does not say how to avoid it.
- `npm run verify` fails for a reason unrelated to your step.
- A spec contradicts `CLAUDE.md`. `CLAUDE.md` wins; tell me which spec line
  is wrong.
