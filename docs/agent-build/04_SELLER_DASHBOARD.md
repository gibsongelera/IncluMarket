# 04: Seller Centre (Apex layout, seller-scoped)

Users: PWD trainees selling what they make. Many are new to online selling;
some use screen readers, magnifiers or the 24px text setting. The
dashboard's job: **what do I do next, and is my shop doing well?** Plain
words, few numbers, every number a link.

## 1. What exists today (verified 2026-11-06)

`app/seller/dashboard/page.tsx` already has, top to bottom:

1. `<h1>Merchant dashboard</h1>`
2. `VerificationStatus` (compact) when the seller is not verified or a
   renewal is due
3. `SellerTodos`: the setup checklist (verify ID, story, shop name, first
   product, first approval) and to-do counts (new orders, orders to ship,
   return requests, low stock, listings needing changes, reviews without a
   reply, unread messages)
4. Four `.kpi` tiles: Monthly revenue, Orders (30d), Items sold (30d),
   Low-stock variants
5. Two charts: Sales volume (12 weeks, line) and Inventory turnover by
   product (bar)
6. Recent orders table (8 rows)

All of it is computed inline in the page. **Keep every feature; change the
layout, the components and where the maths lives.**

## 2. Target layout (lg and up)

```
┌ sidebar ─────┐┌───────────────────────────────────────────────────────────┐
│ Overview     ││ Dashboard                               [+ Add a product] │
│  Dashboard   ││ How your shop is doing and what to do next                │
│ Shop         │├───────────────────────────────────────────────────────────┤
│  Products    ││ [Verification banner, only while needed]                  │
│  Flash sales ││ [Setup checklist, only until complete] [To-do counts]     │
│  Shop sett.  │├─────────────┬─────────────┬─────────────┬────────────────┤
│ Sales        ││ Sales 30d   │ Orders 30d  │ Items sold  │ Ready to       │
│  Orders   4  ││ ₱ · trend ~ │ n · trend ~ │ n · trend ~ │ withdraw ₱     │
│  Reviews  2  │├─────────────┴─────────────┴──────┬──────┴────────────────┤
│  Finance     ││ Sales, last 12 weeks              │ Your orders by status │
│ Customers    ││ [Sales | Orders]            (8)   │ donut           (4)   │
│  Messages 1  │├───────────────────────────────────┼───────────────────────┤
│  Help        ││ Best sellers (8)                  │ Running low (4)       │
│ Account      │├───────────────────────────────────┼───────────────────────┤
│  PWD verif.  ││ Recent orders (8)                 │ Latest reviews (4)    │
└──────────────┘└───────────────────────────────────┴───────────────────────┘
```

Below lg: one column, same order; the phone tab bar stays.

## 3. Widgets

| Widget | Content | Data | Links to |
|---|---|---|---|
| Page head | "Dashboard", one-line description, primary button "Add a product" | | the existing add-product entry point on `/seller/products` |
| Verification banner | Unchanged logic | `getMyVerification` | `/account/verification` |
| Setup + to-dos | Unchanged items; restyle to the shared tile look; a to-do with a count > 0 gets the brown left bar | existing `todos`, `setupSteps` | existing filtered lists |
| KPI: Sales (last 30 days) | Σ this seller's line items over counted orders (`processing`, `shipped`, `delivered`), with trend and 30-day sparkline | today's `revenue30` logic | `/seller/finance` |
| KPI: Orders (last 30 days) | Counted orders containing this seller's items, trend, sparkline | today's `orders30` | `/seller/orders` |
| KPI: Items sold (last 30 days) | Units over counted orders, trend | today's `items30` | `/seller/orders` |
| KPI: Ready to withdraw | `balance.available` from `getSellerFinance`; second line "₱x still on the way" from `balance.pending`; no trend, no sparkline | `lib/finance.ts` | `/seller/finance` |
| Sales, last 12 weeks | Existing weekly buckets; tabs Sales · Orders | today's `buckets` | |
| Your orders by status | Donut of this seller's orders created in the last 30 days by `order_status`, status colours from `01` §2.3, total in the centre | `ordersById` | `/seller/orders?status=…` per segment in the legend |
| Best sellers | Table replacing the "Inventory turnover" bar chart: rank, thumbnail, product, units (30 days), sales (30 days). A table reads better with a screen reader than a bar chart of truncated names | today's `perProduct` + revenue | the product's edit page |
| Running low | Variants with 1–5 left: product, option, how many left, "Update stock" | today's `lowStock` filter, as a list instead of a count | `/seller/products` |
| Recent orders | Existing table; add "View all" | `mineOrders` | `/seller/orders` |
| Latest reviews | 3 newest: stars + number, first line, product, "Reply" when there is no seller reply | `getReviewsLite` | `/seller/reviews` |

Trend and empty-state rules are the same as `03` §4: "New" when the
previous period is 0; good-or-bad colouring with arrow and words; a designed
empty state per widget ("No sales yet. When a buyer orders, it shows here.").

## 4. Where the maths goes

Move the aggregation out of the page into `lib/seller-analytics.ts`
(`import "server-only"`), one function `getSellerDashboard(sellerId)`
returning a DTO like `03` §5. It must:

- take the seller id **from the session** (`requireRole(["seller"])`), never
  from a parameter the browser controls;
- reuse `getSellerProductIndex`, `getOrderItemsForProducts`,
  `getOrdersByIds`, `getVariantsForProducts`, `getReviewsLite`,
  `getSellerFinance`;
- use the same counted-order rule as the admin GMV, so the sum of sellers'
  "Sales (last 30 days)" equals admin GMV;
- keep each widget's failure separate (one `.catch` per read, as the page
  already does for verification and reviews).

## 5. Words

Write for a first-time online seller. Use "Sales", not "GMV" or "revenue";
"Ready to withdraw", not "available balance"; "Running low", not "low-stock
variants"; "last 30 days", not "30d". Keep every label short enough to
survive 30% growth in Filipino. No tooltips that hide needed information.

## 6. Other seller pages

Apply the list pattern from `03` §6 to `/seller/orders`
(`SellerOrdersClient`: status tabs with counts, search, pagination, the
existing packing slip and courier/tracking actions) and `/seller/products`
(`SellerProductsClient`: status pills with the moderation reason, the
existing wizard, duplicate and unpublish). Improve them in place.

Not in this build: Apex-style stock adjustments with reasons and an
activity log. It would need a new table and is worth its own plan.

## 7. Acceptance

- [ ] Every feature in §1 is still there.
- [ ] The page reads top to bottom as: what to fix → how I'm doing → what
      sells → what's running out → what happened recently.
- [ ] "Sales (last 30 days)" for each demo seller adds up to admin GMV.
- [ ] A brand-new seller with no products sees the setup checklist and
      friendly empty states, not zeros in charts.
- [ ] Works at 320px, 24px font, high contrast, reduced motion, keyboard
      only, NVDA. `npm run verify` exits 0.
