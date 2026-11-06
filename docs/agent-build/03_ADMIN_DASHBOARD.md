# 03: Admin console (Apex eCommerce → AVRC admin)

Reference: Apex Dashboard (`apex-shadcn.dashboardpack.com`), pages
`/ecommerce`, `/orders` and `/operations`, reviewed 2026-11-06. Apex is a
paid template: rebuild its **layout and widget set** in our CSS; copy no
code, markup, icons or images.

Users: AVRC Region IX staff. Their job is mostly **queues** (verify PWD IDs,
approve listings, answer tickets, release payouts), then **oversight** (is
the shop healthy?). The Apex layout is adopted in that order: work first,
charts second.

## 1. What to take from Apex, and what to leave

| Apex element | Decision | Becomes |
|---|---|---|
| Dark grouped sidebar with count badges | **Keep** | Console sidebar restyle (`01` §2.5) with badges on queue items |
| Page head: title, one-line description, one primary action | **Keep** | "Overview · What needs you today and how the shop is doing" + "Download report" → `/admin/reports` |
| 4 KPI cards with trend and sparkline | **Keep** | GMV, Orders, Average order value, Return rate (§4) |
| Sales overview area chart with Revenue / Orders / Profit tabs | **Keep, 2 tabs** | Revenue · Orders. No "Profit": the platform does not record costs |
| Order status donut with legend counts | **Keep** | Order status, last 30 days |
| Top selling products table | **Keep** | Top 5 products, with seller shop |
| Sales by category bar chart | **Keep** | Revenue by category, horizontal bars so long names stay readable |
| Recent transactions with initials avatars and status | **Keep** | Recent orders, with payment and order status pills |
| Revenue targets with progress bars | **Drop** | There are no targets in the data. Do not invent them |
| Conversion rate, Page views, Active users | **Drop** | No visit tracking exists; do not invent it |
| "New Order" header button | **Drop** | Admins do not create orders |
| ⌘K command palette, theme and palette buttons, layout and density switchers | **Drop** | Admin → Theme already exists; the rest is out of scope |
| Orders list: status tabs, result count, columns, export, avatars, row actions, pagination | **Keep** | List pattern for `/admin/orders`, `/admin/products`, `/admin/users` (§6) |
| Store operations: on hand / reserved / available, adjustments with reasons, activity | **Seller side only** | Low-stock card in `04`; no admin inventory page in this build |
| CRM, HR, Academy, Logistics, SaaS, Marketing, Project, AI dashboards; mail, chat, files, kanban, calendar apps | **Drop** | Out of scope |

## 2. Layout of `/admin` (lg and up)

```
┌ sidebar ┐┌──────────────────────────────────────────────────────────────┐
│Overview ││ Overview                                  [Download report] │
│ People  ││ What needs you today and how the shop is doing               │
│ Users   │├──────────────────────────────────────────────────────────────┤
│ Verif.3 ││ NEEDS ATTENTION   9 queue tiles (existing), brown bar if > 0  │
│ Catalog │├──────────────┬──────────────┬──────────────┬────────────────┤
│ Prod. 5 ││ GMV 30d      │ Orders 30d   │ Avg order    │ Return rate    │
│ Orders 2││ ₱ · trend ·~ │ n · trend ·~ │ ₱ · trend ·~ │ % · trend ·~   │
│ …       │├──────────────┴──────────────┴─────────┬────┴────────────────┤
│ Support ││ Sales overview  [Revenue|Orders]  (8) │ Order status (4)    │
│ Tickets1││ line/area, 30 daily points            │ donut + legend      │
│ Insight │├───────────────────────────────────────┼─────────────────────┤
│ …       ││ Top selling products (8)              │ Sales by category(4)│
│Settings │├───────────────────────────────────────┼─────────────────────┤
│ …       ││ Recent orders (8)                     │ The shop (4)        │
└─────────┘└───────────────────────────────────────┴─────────────────────┘
```

- Below lg: one column in the same order; the sidebar becomes the existing
  phone tab bar and More sheet; tables become cards.
- "The shop" keeps the existing health counts from `lib/admin-overview.ts`
  (orders this week, new accounts, active sellers, live listings).
- "Needs attention" stays first and keeps its existing links. Restyle the
  tiles to the KPI card shell without sparklines; a tile with work waiting
  gets the brown left bar it has today.

## 3. Sidebar badges

Show a count badge on: Verifications (PWD IDs to review + duplicate flags),
Products (listings to review), Orders (refunds due + returns waiting over a
day), Tickets (open support requests), Payouts (to approve or send),
Compliance (privacy requests + contact messages). The counts are the same
ones `getAdminOverview().todo` already computes. Read them once in
`app/admin/layout.tsx`. If that adds noticeable time to every admin page,
measure it and say so in the plan before shipping it. Badges carry an
accessible name ("3 waiting"), not just a number.

## 4. Metric definitions

One rule for every number, shared with the seller dashboard and finance so
the figures agree.

- **Counted order:** `im_orders.order_status in ('processing','shipped','delivered')`.
  This is the `ACTIVE` set `app/seller/dashboard/page.tsx` already uses.
  Pending orders (not yet confirmed or paid) and cancelled ones are left out.
- **Window:** the last 30 days ending now, Asia/Manila day boundaries.
  **Previous window:** the 30 days before that.

| KPI | Definition | Good direction | Links to |
|---|---|---|---|
| GMV (30 days) | Σ `im_order_items.unit_price × quantity` over counted orders created in the window. Item value, not `total_amount`, so shipping is excluded and the figure equals the sum of every seller's revenue | Up | `/admin/orders` |
| Orders (30 days) | Count of counted orders created in the window | Up | `/admin/orders` |
| Average order value | GMV ÷ Orders. "—" when Orders is 0 | Up | `/admin/orders` |
| Return rate | Orders created in the window that reached `return_requested` or `returned`, divided by orders created in the window that reached `delivered`, `return_requested` or `returned`. "—" when the divisor is 0 | **Down** | `/admin/orders?view=returns` |

- **Trend:** (current − previous) ÷ previous, one decimal. Previous = 0 →
  "New". Text: "up 18.2% vs previous 30 days".
- **Sparklines and the sales chart:** 30 daily points; Revenue = GMV per
  day, Orders = counted orders per day.
- **Order status donut:** all orders created in the window grouped by
  `order_status` (`pending`, `processing`, `shipped`, `delivered`,
  `cancelled`, `return_requested`, `returned`), coloured by the status
  mapping in `01` §2.3, total in the centre.
- **Top selling products:** top 5 by units across counted orders in the
  window. Columns: rank, product (thumbnail, title, category), shop, units,
  revenue. Links to the product in `/admin/products`.
- **Sales by category:** GMV in the window grouped by the product's
  category, highest first, at most 8 bars, the rest summed as "Other".
- **Recent orders:** the 8 newest orders of any status. Columns: order
  number, buyer (initials avatar + name), shop, amount (`total_amount`),
  payment status pill, order status pill, date. Mask emails with
  `lib/format.ts` if shown at all.
- Every value that cannot be read (missing migration) shows "—" and "Needs
  a database update". Every widget with no data yet shows a designed empty
  state ("No orders in the last 30 days"), never a blank chart.

Check the column names above against migrations `0001`, `0010`, `0014`
and `0015` before writing queries; report any mismatch in the plan.

## 5. Data module

Create `lib/admin-analytics.ts` (`import "server-only"`) exporting one
function that returns a single DTO for the page:

```ts
interface AdminAnalytics {
  kpis: { key: string; label: string; value: number | null; previous: number | null;
          format: "money" | "count" | "percent"; goodWhen: "up" | "down";
          series: number[]; href: string }[];
  sales: { labels: string[]; revenue: number[]; orders: number[] } | null;
  status: { status: string; label: string; count: number }[] | null;
  topProducts: { id: number; title: string; category: string; shop: string;
                 image: string | null; units: number; revenue: number }[] | null;
  byCategory: { label: string; value: number }[] | null;
  recentOrders: { id: number; buyer: string; shop: string; amount: number;
                  paymentStatus: string; orderStatus: string; createdAt: string }[] | null;
}
```

`null` means "could not be read" and renders the unavailable state. Run the
reads in parallel. If pulling 60 days of order items into JavaScript is
slow, move the aggregation into one SQL function in a new migration (see
`02` §5).

## 6. List pages (Apex `/orders` pattern)

Improve `AdminOrdersClient`, `AdminProductsClient` and `AdminUsersClient`
in place; keep their existing actions and URL filters (`?status=`,
`?view=`, `?role=`).

- Page head: title, description, primary action only where one exists.
- Status tabs with counts (`components/Tabs.tsx` or links with
  `aria-current`), result count ("20 results"), search box, filters.
- "Export": link to the matching `.xlsx` report in `/admin/reports` when
  one exists. Do not write new exporters in this build.
- Table per `01` §6.3: initials avatar identity cell, pills, right-aligned
  money, an "Actions" menu per row that works by keyboard. Destructive
  actions keep their reason prompt and `ConfirmDialog`.
- Pagination: 10 / 25 / 50 per page, server-side, state in the URL.
- Phones: table → card through `TableWrap`.

## 7. Acceptance

- [ ] `/admin` shows the sections of §2 in that order, with real data from
      the demo seed, and every number links somewhere useful.
- [ ] GMV equals the sum of all sellers' 30-day revenue on their own
      dashboards (spot-check two sellers).
- [ ] KPI values are charcoal; trend shows icon + words; return rate going
      down shows as good.
- [ ] Each chart has a data-table alternative and an empty state.
- [ ] Sidebar badges match the "Needs attention" tiles.
- [ ] Orders, products and users lists have tabs with counts, search,
      pagination and keyboard row actions; phones show cards.
- [ ] Works at 320px, 24px font, high contrast, reduced motion, keyboard
      only. `npm run verify` exits 0.
