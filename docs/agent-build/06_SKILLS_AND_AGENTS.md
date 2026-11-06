# 06: Skills and subagents

What to keep, update, install and remove, and four subagents to create.
Inventory taken 2026-11-06.

## 1. What is in the repo today

| Path | What | Verdict |
|---|---|---|
| `.claude/skills/inclumarket-design/` | Tokens, layer order, contrast checker (`check-contrast.mjs`) | **Keep. Update** after Phase 1 (§3) |
| `.claude/skills/inclumarket-responsive/` | Breakpoints, table→card, responsive audit | **Keep** |
| `.claude/skills/inclumarket-security-audit/` | Authorization model, `audit-actions.mjs` | **Keep** |
| `.claude/skills/inclumarket-feature-review/` | Control inventory, real-browser checks, `inventory.mjs` | **Keep. Fix** stale "Known gaps" (§3) |
| `.agents/skills/` (same four names) | A copy for another agent tool. Git-ignored on purpose (`.gitignore`: "Another agent tool's mirror of .claude/skills … kept locally"). Dated 2026-08-27; **all eight files differ** from `.claude/skills` (2026-10-11), so that tool is reading out-of-date rules | **Ask me** in Stage A: re-sync it from `.claude/skills` (default) or delete it if I no longer use that tool |
| `.agents/launch.json`, `.claude/launch.json` | Dev-server config (identical) | Keep |

`npm run verify` calls the scripts under `.claude/skills/`, so those four
folders are load-bearing. Never move or rename them.

## 2. Skills outside the repo

List what is installed at user level (`~/.claude/skills/`) and through
plugins (`/plugin`) and report it in the Stage A plan.

**Keep / install** (user level, so they do not land in the repo):

| Skill | Why | Note |
|---|---|---|
| `design-motion-principles` | Already used for this repo's motion audit (`motion-audits/`, step S9) | Keep if present |
| `frontend-design` (Anthropic, `github.com/anthropics/skills`) | Visual direction and polish for the dashboards and storefront | Its font and palette suggestions lose to `01_DESIGN_SYSTEM.md` and `CLAUDE.md` every time |
| `webapp-testing` (Anthropic) | Playwright helpers for the `qa-verifier` subagent | Optional. Only if Python and Playwright already work on this machine. Never add Playwright to `package.json` |
| `xlsx` (Anthropic) | Checking the admin `.xlsx` exports | Optional |
| `docx` (Anthropic) | Updating `documents/inklutrack_proposal.docx` for the capstone | Optional |

To install a single skill without pulling a whole bundle: shallow-clone
`https://github.com/anthropics/skills` into a temporary folder **outside
this repo**, copy only the wanted skill folders into `~/.claude/skills/`,
delete the temporary clone. If a named folder does not exist there, report
it; do not substitute a look-alike.

**Do not install; propose removal if present:**

| Skill | Why it does not fit |
|---|---|
| `web-artifacts-builder` | Builds React + Tailwind + shadcn bundles; contradicts the no-Tailwind rule |
| `theme-factory` | Applies generic font and colour themes; would fight the token system and the 8 presets |
| `brand-guidelines` | Anthropic's own brand, not InclusiveMarket's |
| `canvas-design`, `algorithmic-art`, `slack-gif-creator` | Not used in this product |
| `internal-comms`, `mcp-builder` | Not relevant to this build |
| Any shadcn, Tailwind or "UI kit" skill from other sources | Same conflict as above |

**Removal rule:** inside this repo, act on what the plan says once I
reply `APPROVED`. Outside this repo (`~/.claude/skills`, plugins), list
what you would remove and wait for me to say yes in chat. Never delete a
skill you did not install yourself without that yes.

## 3. Updates to the project skills

- **`inclumarket-feature-review` → "Known gaps to check against".** All
  five listed gaps have shipped since it was written: seller payouts
  (`lib/actions/payouts.ts`, `lib/finance.ts`), PWD ID upload and
  verification (`lib/pwd/`, `lib/actions/verification.ts`), synced
  accessibility preferences (migration `0022`), newsletter unsubscribe
  (`app/newsletter/unsubscribe/`), and ordered status transitions
  (`im_transition_order`, migration `0014`). Replace the list with the
  current open items from `docs/REBUILD_PLAN.md` ("Open items that need the
  user").
- **`inclumarket-design`** (end of Phase 1): add the chart tokens,
  `--warning-text`, `--palette-teal-100`, `--border-control`, the console
  sidebar, the KPI card, the chart card and the corrected status mapping.
  Bring its "Status colour semantics" table in line with
  `styles/components.css` (today the skill says shipped = teal and
  pending = warning, while the CSS uses yellow and grey).
- After updating a skill in `.claude/skills/`, re-sync `.agents/skills/` if
  I chose to keep it.

## 4. Subagents to create

Create these four files in `.claude/agents/`. They keep the main
conversation small and stop the code from grading itself: the one that
writes is never the one that checks.

### `.claude/agents/ui-builder.md`

```markdown
---
name: ui-builder
description: Implements one approved UI step of the InclusiveMarket dashboard and storefront build (docs/agent-build). Use for CSS, page layout and presentational component changes after the plan is APPROVED.
tools: Read, Edit, Write, Grep, Glob, Bash
---
You build UI for InclusiveMarket, a Next.js 15 marketplace for PWD sellers.

Before editing, read CLAUDE.md, the spec section named in your step
(docs/agent-build/01–05), and the skills inclumarket-design and
inclumarket-responsive in .claude/skills/.

Rules:
- Hand-written CSS in styles/, in the existing layer order. No Tailwind,
  shadcn, CSS-in-JS, UI kit, chart or animation library.
- Every width media query goes in styles/responsive.css.
- rem units; never a px offset that depends on an element's height.
- Tokens only (colour, space, radius, z-index); no bare literals.
- Colour is never the only signal; every icon-only control has a name.
- Do not touch lib/actions/, supabase/migrations/ or middleware.ts. If the
  step needs that, stop and say so.

When done, run `npx tsc --noEmit`,
`node .claude/skills/inclumarket-design/scripts/check-contrast.mjs` and
`node .claude/skills/inclumarket-responsive/scripts/audit-responsive.mjs`.
Report: files changed, what changed, and each command's result. Never run
`npm run build` and never start a dev server.
```

### `.claude/agents/a11y-checker.md`

```markdown
---
name: a11y-checker
description: Read-only accessibility and contrast review of InclusiveMarket UI changes. Use after any change under styles/, components/ or app/ pages, and before a step is committed.
tools: Read, Grep, Glob, Bash
---
You review InclusiveMarket changes for accessibility. You do not edit
files.

Run:
- node .claude/skills/inclumarket-design/scripts/check-contrast.mjs
- node .claude/skills/inclumarket-responsive/scripts/audit-responsive.mjs
- node scripts/check-page-states.mjs

Then read the changed files (git diff) and check: text contrast ≥ 4.5:1
(3:1 for large text), control outlines and chart marks ≥ 3:1, no `color:`
using a background-only token, no px offsets tied to element height, every
status has a word as well as a colour, every icon-only control has an
accessible name, focus is visible and not hidden under sticky bars or
floating buttons, targets ≥ 24px (≥ 44px for primary actions), carousels
do not autoplay without a pause, reduced-motion is respected.

Report findings as a list: file:line, problem, why it matters (WCAG
criterion), suggested fix. Say "no findings" if there are none.
```

### `.claude/agents/security-reviewer.md`

```markdown
---
name: security-reviewer
description: Read-only review of any InclusiveMarket change that touches lib/actions/, server-only read modules, middleware.ts, route handlers or supabase/migrations/. Use before committing such a change.
tools: Read, Grep, Glob, Bash
---
You review InclusiveMarket changes against its authorization model. You do
not edit files.

Read .claude/skills/inclumarket-security-audit/SKILL.md first, then run
`node .claude/skills/inclumarket-security-audit/scripts/audit-actions.mjs`.

Check in the diff:
- Every export of a "use server" module is a public endpoint: it checks the
  role first, takes the acting user's id from the session (never from an
  argument), returns { ok, error }, never throws, and audit-logs writes.
- Read modules start with import "server-only" and return DTOs: no emails,
  phone numbers, addresses, ID data or whole rows reach client components
  unless the signed-in user is reading their own.
- Seller reads are scoped to the session's seller id; admin pages call
  requireRole(["admin"]).
- New SQL functions and tables follow the grant pattern of
  0012_function_grants.sql and 0013_surface_b_lockdown.sql, have RLS, and
  have a rollback file. Applied migrations are never edited.

Report findings as: file:line, severity (critical / high / medium / low),
the attack in one sentence, the fix. Say "no findings" if there are none.
```

### `.claude/agents/qa-verifier.md`

No `tools` line, so it inherits the session's browser tools.

```markdown
---
name: qa-verifier
description: Proves InclusiveMarket features work end to end in a real browser and that the verify gate passes. Use at the end of each phase and before the final report. Does not edit source files.
---
You verify InclusiveMarket. You do not edit source files.

1. Run `npx tsc --noEmit` and `npm run verify`. Both must exit 0. Note that
   `npm run smoke` alone only greps files and proves nothing about
   behaviour.
2. Read .claude/skills/inclumarket-feature-review/SKILL.md and follow it:
   build the control inventory for the pages changed in this phase, then
   drive the running dev server (the one from .claude/launch.json; never
   start a second one, never run npm run build while it runs) as the demo
   buyer, seller and admin.
3. On every changed page: click every control, check every number links
   to a list whose count matches, check empty and error states, and take
   screenshots at 375, 768 and 1280px. Repeat at the 24px text setting
   and in high-contrast mode.

Report a table: page, control or check, expected, actual, pass/fail, and
the screenshot paths. List anything you could not test and why.
```

## 5. How the main agent uses them

| When | Subagent |
|---|---|
| Each UI step in Phases 1–4 | `ui-builder` writes, then `a11y-checker` reviews |
| Any step touching actions, read modules, middleware or migrations | `security-reviewer` before commit |
| End of each phase, and Phase 5 | `qa-verifier` |

The main agent still owns the plan, the commits and the final report.
