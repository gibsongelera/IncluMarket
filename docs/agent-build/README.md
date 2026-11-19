# Agent build pack: admin, seller and buyer redesign

This folder is a prompt pack for Claude Code (or any coding agent) working in
this repository. It turns the brief "online shopping system: design
principles, architecture, Apex-style admin and seller dashboards, Emox-style
buyer home" into instructions grounded in the code that already exists.

**Nothing in this folder changes the app.** These are instructions only.

## How to use

1. Open Claude Code in `C:\xampp\htdocs\Capstonepaul`.
2. Send exactly this:

   ```
   Read docs/agent-build/00_MASTER_PROMPT.md and follow it exactly.
   ```

3. The agent writes a plan (Stage A) and stops. Read it, then reply
   `APPROVED` (with any edits) to let it build (Stage B).

## Files

| File | What it is |
|---|---|
| `00_MASTER_PROMPT.md` | **The prompt.** Ground rules, phases, plan format, stop conditions. |
| `01_DESIGN_SYSTEM.md` | Colours, fonts, palette, spacing, component anatomy, chart colours, with measured contrast for every pair. |
| `02_ARCHITECTURE.md` | The design principles from the brief mapped to how this codebase meets them, and why it stays a modular monolith. |
| `03_ADMIN_DASHBOARD.md` | Apex eCommerce dashboard adapted to the AVRC admin console: what to keep, what to drop, metric definitions. |
| `04_SELLER_DASHBOARD.md` | Seller Centre redesign: Apex layout on top of the features that already exist. |
| `05_BUYER_STOREFRONT.md` | Emox home-page structure mapped onto existing storefront components, plus a buyer account dashboard. |
| `06_SKILLS_AND_AGENTS.md` | Which skills to keep, update, install or remove, and four subagents to create in `.claude/agents/`. |

## Decisions already made in this pack

These are made so the agent does not have to guess. Change them here before
running the prompt if you disagree.

1. **Apex is a visual and structural reference, not a dependency.** Apex is a
   paid template (from $69, no redistribution) built on Next.js 16, Tailwind
   CSS v4 and shadcn/ui. This repo is Next.js 15 with hand-written CSS and
   `CLAUDE.md` forbids Tailwind and UI kits. The agent rebuilds Apex's
   *layout and widgets* in the existing CSS. It does not copy Apex code,
   install shadcn/Tailwind, or use Apex assets or branding.
2. **Emox is a layout reference for the storefront home only.** Its section
   order and rhythm are adopted; its colours are not. The palette stays the
   client-approved InclusiveMarket blue and brown (decision of 2026-10-09).
3. **Fonts stay Nunito Sans (body) and Rubik (display).** Apex uses Geist. A
   third family adds weight for no user benefit, and Nunito Sans' open shapes
   read well for low-vision users.
4. **Architecture stays a modular monolith** (Next.js server components and
   server actions on Supabase Postgres). The brief's microservices, Kafka,
   Redis and Elasticsearch are right for a national retailer, wrong for an
   AVRC Region IX marketplace. `02_ARCHITECTURE.md` explains the substitutes.
5. **No dark mode in this pass.** High-contrast mode is the accessibility
   answer here. Dark mode would double the contrast surface across eight
   theme presets.

Baseline for every claim in this pack: the working tree on 2026-11-06,
`HEAD` at `e06a60f`.
