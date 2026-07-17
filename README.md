# InkluMarket &mdash; Static Demo

Front-end-only e-commerce demo for the **InkluTrack** capstone ecosystem. Built with vanilla HTML, CSS, and JavaScript. No backend, no database, no build step. Data is seeded from `assets/js/seed.js` into the browser's `localStorage`.

**For capstone demonstration only.** See the Security Disclaimer below.

---

## Quick start

You can run the demo in either of two ways:

### Option A: XAMPP (recommended, since this project lives under `htdocs`)

1. Start Apache from the XAMPP control panel.
2. Open `http://localhost/Capstonepaul/` in a modern browser (Chrome, Edge, Firefox, or Safari).
3. Log in with any seeded account below.

### Option B: Open the file directly

Double-click `index.html` (or drag it into a browser). This works because there are no fetches or CORS-restricted APIs. Chrome may sometimes warn about local file access &mdash; XAMPP is cleaner.

---

## Demo accounts

Default password for **all** seeded accounts: `demo1234`. (Any non-empty password is also accepted for a known email in the demo.)

| Role   | Email                       | Name              |
| ------ | --------------------------- | ----------------- |
| Admin  | `admin@inklumarket.ph`      | Ana Reyes         |
| Seller | `seller1@inklumarket.ph`    | Maria Santos      |
| Seller | `seller2@inklumarket.ph`    | Juan dela Cruz    |
| Seller | `seller3@inklumarket.ph`    | Liwayway Bautista |
| Seller | `seller4@inklumarket.ph`    | Ramil Aquino      |
| Seller | `seller5@inklumarket.ph`    | Perla Manalo      |
| Seller | `seller6@inklumarket.ph`    | Ernesto Gapasin   |
| Buyer  | `buyer1@inklumarket.ph`     | Karla Mendoza     |
| Buyer  | `buyer2@inklumarket.ph`     | Paulo Villanueva  |
| Buyer  | `buyer3@inklumarket.ph`     | Bea Aguilar       |
| Buyer  | `buyer4@inklumarket.ph`     | Miguel Tan        |
| Buyer  | `buyer5@inklumarket.ph`     | Jasmine Reyes     |
| Buyer  | `buyer6@inklumarket.ph`     | Roman Cruz        |
| Buyer  | `buyer7@inklumarket.ph`     | Elena Salvador    |
| Buyer  | `buyer8@inklumarket.ph`     | Nico Domingo      |

You can also create a new account from the landing page (opens a signup form). Registration captures a DPA consent record into the `consent_logs` collection.

---

## Feature map

### Buyer (`buyer/`)
- **home.html** &mdash; product discovery grid with search, category, price, and minimum-rating filters.
- **product.html** &mdash; product detail with color/size variant matrix, live stock checks, quantity input, add-to-cart / buy-now, and existing reviews.
- **cart.html** &mdash; view/edit quantities (bounded to stock), remove items, subtotal, checkout entry.
- **checkout.html** &mdash; delivery + simulated payment; on submit, creates an order + line items and decrements variant stock.
- **orders.html** &mdash; order history filtered by lifecycle status; leave a review after delivery.
- **support.html** &mdash; open new tickets and view your ticket threads.

### PWD Seller (`seller/`)
- **dashboard.html** &mdash; 4 KPIs, 12-week sales line chart, top-product turnover bar chart, recent orders table.
- **products.html** &mdash; add / edit / delete products, manage color + size + stock + SKU variants (SKU uniqueness enforced in JS).
- **orders.html** &mdash; fulfillment queue with lifecycle advance buttons (`pending → processing → shipped → delivered`), plus `mark returned`.
- **reviews.html** &mdash; average rating KPIs and filterable review feed.

### Administrator (`admin/`)
- **users.html** &mdash; searchable user table with role change and details (PII masked).
- **products.html** &mdash; verification queue with **Approve / Flag / Re-queue** actions on submitted listings.
- **tickets.html** &mdash; two-pane CRM: ticket list + detail thread; reply, change status, assign to self.
- **compliance.html** &mdash; RA 10173 consent count, PII-masked-fields count, daily activity chart, orders-by-status pie chart, and a recent audit trail.

---

## Data model

`assets/js/seed.js` mirrors the PostgreSQL schema from the InkluMarket directive 1:1 as arrays of objects:

```
users, products, product_variants, orders, order_items,
product_reviews, support_tickets, consent_logs, audit_logs, categories
```

`assets/js/store.js` is the data-access layer &mdash; it seeds `localStorage` on first load and enforces CHECK-constraint values (order status, ticket status, priority, role, rating range, non-negative stock) in JavaScript before every write.

### Reset

Click **Reset demo data** on the landing page (or clear `localStorage` in DevTools) to reseed the store.

---

## Design system

`assets/css/tokens.css` exposes the DSWD Visual Identity (MC 01, S. 2024) as CSS custom properties:

- `--brand-blue`   = `#2E3192`
- `--brand-red`    = `#EE1C25`
- `--brand-yellow` = `#FEF200`
- `--text-charcoal`= `#212529`
- `--canvas-white` = `#FFFFFF`
- `--border`       = `#DEE2E6`
- `--surface-gray` = `#F8F9FA`

### Contrast guardrails (baked into components.css)

1. White typography is **never** placed on Yellow (`--brand-yellow`) or Red (`--brand-red`) surfaces. Badges, warning pills, shipped-status pills, discount tags, and hero tiles all use `--text-charcoal` on those backgrounds.
2. White typography is permitted **only** inside `.btn--primary` (Blue) and `.btn--danger` (Red).

A **High contrast** toggle in the top-right of every page persists to `localStorage` and overrides the base tokens for maximum foreground/background separation.

---

## Accessibility (WCAG 2.1 AA-aligned)

- Skip-to-content link on every page.
- Semantic landmarks: `header`, `nav`, `main`, `aside`, `footer`.
- Visible focus rings on every interactive element (`:focus-visible`).
- `aria-live` regions for cart badge, filter results, ticket panel, and toasts.
- Native `<dialog>` modals for review submission and product editing.
- Keyboard-operable variant selectors, rating input (arrow keys), and tab groups.
- Alt/aria labels on charts and iconography; iconography is redundant to text labels.
- `prefers-reduced-motion` disables animations.

---

## Non-functional coverage (demo scope)

| NFR                   | How it appears in the demo                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **NFR-01 Usability**  | Short primary paths (add-to-cart → checkout in 3 clicks; seller stock inline; admin approve in one click).       |
| **NFR-02 A11y**       | Everything under *Accessibility* above.                                                                          |
| **NFR-03 Performance**| Static assets only. No network calls. Pages load instantly on any device.                                        |
| **NFR-04 Security**   | **Simulated.** Password field labeled "hashed on submit (bcrypt cost 12)". No real hashing is performed.         |
| **NFR-10 Data Privacy**| PII masking (`ui.maskEmail`) applied to seller and admin views. Signup captures a DPA consent record into `consent_logs`. Compliance dashboard shows totals. |

---

## Security &amp; privacy disclaimer

This is a **demonstration build**. To keep the demo runnable with zero backend and zero dependencies:

- Passwords in `seed.js` and new signups are placeholder strings labeled `bcrypt-cost-12$demo$...`. **No real bcrypt hashing is performed** in the browser.
- There is **no TLS 1.2+**, no AES-256 at rest, no CSRF protection, no rate limiting, and no server-side authorization. A real InkluMarket deployment would enforce all of these in a Node/PostgreSQL backend.
- Anyone with access to your browser can inspect and modify the seeded data via DevTools. Do not use this build with real customer data.

The Admin **Compliance monitor** and the landing-page disclaimer both call this out to the demo audience.

---

## Project structure

```
Capstonepaul/
  index.html
  README.md
  admin/     users.html  products.html  tickets.html  compliance.html
  buyer/     home.html   product.html   cart.html      checkout.html
             orders.html support.html
  seller/    dashboard.html  products.html  orders.html  reviews.html
  assets/
    css/     tokens.css  base.css  components.css  layout.css
    js/      seed.js   store.js  ui.js   auth.js   cart.js   charts.js
             page.login.js
             page.buyer-home.js  page.buyer-product.js
             page.cart.js         page.checkout.js
             page.buyer-orders.js page.support.js
             page.seller-dashboard.js  page.seller-products.js
             page.seller-orders.js     page.seller-reviews.js
             page.admin-users.js       page.admin-products.js
             page.admin-tickets.js     page.admin-compliance.js
    img/     (unused; product art is emoji + labels for zero-asset demo)
  documents/ inklutrack_proposal.md
  inklutrack_proposal.json
```

---

## Suggested demo script (5 minutes)

1. **Landing** &mdash; toggle **High contrast**, then sign in as `buyer1@inklumarket.ph`.
2. **Buyer/home** &mdash; filter by category "Handicrafts", open a product.
3. **Buyer/product** &mdash; try picking a color where a size is greyed-out (variant matrix), add to cart.
4. **Buyer/cart** → **checkout** &mdash; place an order (stock decrements automatically).
5. Sign out. Sign in as `seller1@inklumarket.ph`.
6. **Seller/dashboard** &mdash; note the KPIs and charts pull from the same data.
7. **Seller/products** &mdash; open **Add new product**, add variants, save (it enters the admin queue as *pending*).
8. **Seller/orders** &mdash; advance an order from *pending* to *processing* to *shipped*.
9. Sign out. Sign in as `admin@inklumarket.ph`.
10. **Admin/products** &mdash; approve the new listing you just created.
11. **Admin/tickets** &mdash; open a ticket, reply, mark resolved.
12. **Admin/compliance** &mdash; show consent counts, audit trail, and read the disclaimer.
