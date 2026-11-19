# 05: Storefront home and buyer dashboard (Emox pattern)

Reference: "Emox I eCommerce Landing Page Design" by Musemind on Dribbble
(shot 26100488), reviewed 2026-11-06. Take its **section order, density and
rhythm**. Do not take its colours, imagery, brand names or copy. The
palette stays InclusiveMarket blue and brown (`01`).

## 1. Emox, section by section

What the shot shows, top to bottom, and what each becomes here.

| # | Emox section | InclusiveMarket | Component today | Change |
|---|---|---|---|---|
| 1 | Utility header: logo, wide search, delivery location, language, cart, sign in | Site header | `SiteHeader`, `SearchBox`, `CartBadge`, `NotificationBell` | Restyle only: search gets the widest slot. No location or language picker (out of scope) |
| 2 | "All categories" bar under the header | (none) | | **Skip.** Round category tiles (#4) do this job; two category navs on one screen is clutter for screen-reader and magnifier users |
| 3 | Hero: large rotating banner (two-thirds) + one promo tile (one-third) | Hero | `BannerStrip` | Two-thirds carousel of active banners; one-third side tile built from data: the live flash sale with its countdown, else a featured PWD shop spotlight. Carousel rules in `01` §6.5 |
| 4 | "Explore popular categories": round image tiles in a scrolling row | Categories | `CategoryChips` | Round **icon** tiles with name and count (categories have icons, not photos) |
| 5 | "Today's best deals for you": product row | Flash sale | `FlashSaleStrip`, `Countdown` | Section header with countdown and "View all" |
| 6 | Three promo banner tiles | Featured products | `StorefrontGrid` (featured) | Becomes a rail. No new banner placements: `im_banners` has order but no placement field, and this build adds no schema |
| 7 | "Explore official brand stores": 4×2 grid of store cards | Featured PWD sellers | `seller-rail` / `seller-card` in `app/home/page.tsx` | Store-card grid (`01` §6.5). Extend `FeaturedShopLite` with the shop logo and product count if the data exists; otherwise keep the initial avatar |
| 8 | "Bestseller in Grocery", "Bestseller in Home Appliances": category rails | Best sellers by category | `searchStorefront` with `sort: "top_sales"` | **New:** rails for the two categories with the most live products, 10 items each. Two extra reads; no more than two rails |
| 9 | "Real-time AI recommends what you like" | Picked for you | `RecommendationRail` (`lib/recommend.ts`) | Keep the honest label ("Picked for you", "Popular this week"). `lib/recommend.ts` ranks by views, co-purchases and popularity; do not call it AI. Note the proposal's "AI-based recommendations" promise as a gap in the plan |
| 10 | Full-width seasonal campaign band | Theme presets | `lib/theme.ts` | **Skip the band.** The 8 runtime presets (Buwan ng Wika, PWD Awareness, Christmas, …) already restyle the whole site for campaigns |
| 11 | More product rows | Discover | `StorefrontGrid`, `SortTabs`, `LoadMore` | Unchanged behaviour; restyled header |
| 12 | Footer | Footer | `SiteFooter` | Unchanged (deep brown, details from `lib/site.ts`) |

## 2. Target order of `/home` (browsing, no category selected)

```
Header ─ logo · [ search ······························ ] · wishlist · cart · bell · account
Hero   ─ [ banner carousel (2/3)                ] [ flash sale or shop spotlight (1/3) ]
         Explore categories                                          View all →
         ( ◯ Bags ) ( ◯ Apparel ) ( ◯ Crafts ) ( ◯ Food ) …  ‹ ›
         Today's deals · ends in 03:12:44                           View all →
         [card][card][card][card][card]                              ‹ ›
         Featured products                                          View all →
         [card][card][card][card][card]
         Shops by PWD sellers                                       View all →
         [store][store][store][store]
         [store][store][store][store]
         Best sellers in <Category A>                               View all →
         [card][card][card][card][card]
         Best sellers in <Category B>                               View all →
         [card][card][card][card][card]
         Picked for you
         [card][card][card][card][card]
         Discover                           Latest · Top sales · Price ↑ · Price ↓
         [grid 2/3/4/5 columns] … [Load more]
Footer
```

- When a category is selected, keep today's behaviour: rails hidden, the
  feed shows that category.
- Home background: `--canvas-white`. Sections separated by `--space-7` of
  whitespace, not by boxes.
- Every rail: section header (`01` §6.4), one scrollable row with
  previous/next buttons from md up, 2-column wrap on phones, no autoplay.
- Hide a section entirely when it has no items; never show an empty rail.
- Keep 24 cards per page and server-side state in the URL, as today.

## 3. Buyer dashboard (`/account` for a signed-in buyer)

Today `/account` shows account details and the PWD verification card.
For **buyers**, turn it into a purchases dashboard (Shopee/Lazada "Me"
page). Sellers and admins keep today's page.

```
Hi, {first name}                                        [Edit profile]
┌ My purchases ─────────────────────────────────────── View all orders → ┐
│  [icon To pay 1]  [icon To ship 2]  [icon To receive 0]  [icon Return / refund 0] │
└────────────────────────────────────────────────────────────────────────┘
┌ Recent orders (3) ───────────────────┐ ┌ PWD verification ─────────────┐
│ thumb · shop · status pill · ₱ · Track│ │ existing VerificationStatus   │
└──────────────────────────────────────┘ └───────────────────────────────┘
┌ Wishlist (4) ─────────── View all → ┐ ┌ Shortcuts ─────────────────────┐
│ [card][card][card][card]            │ │ Addresses · Notifications ·    │
└─────────────────────────────────────┘ │ Privacy · Accessibility · Help │
                                        └────────────────────────────────┘
Picked for you  [card][card][card][card][card]
```

Icons come from `Icon.tsx` or FontAwesome solid, decorative next to the
visible label.

| Widget | Data | Links to |
|---|---|---|
| My purchases | Count of this buyer's orders per tab using `buyerTab()` and `BUYER_TABS` from `lib/orders/state.ts`. Show To pay, To ship, To receive, Return / refund | `/buyer/orders?tab=to_pay` etc. |
| Recent orders | 3 newest orders: first item thumbnail, shop, status pill, total, "Track" | `/buyer/orders/[id]` |
| PWD verification | Existing `VerificationStatus` (compact) | `/account/verification` |
| Wishlist | 4 items from `getWishlistView` | `/buyer/wishlist` |
| Shortcuts | Existing account routes from `ACCOUNT_TABS` plus Help | as listed |
| Picked for you | `getHomeRecommendations(userId)` | product pages |

Read everything for the session's own user id only. One failing widget
shows its own error state; the page still renders.

## 4. Other buyer pages

No structural change in this build to product, cart, checkout, orders,
wishlist, messages or support. They pick up the shared tokens, table and
pill styles from Phase 1. Check each still works at 320px and 24px after
Phase 1.

## 5. Acceptance

- [ ] `/home` follows §2's order; empty sections are hidden; the selected-
      category view behaves as today.
- [ ] Carousel: no autoplay (or a visible Pause, ≥ 5s, pauses on hover and
      focus, off under reduced motion); named previous/next buttons.
- [ ] Category tiles, deal cards, store cards and rails are keyboard
      reachable in reading order, with visible focus.
- [ ] Nothing is labelled "AI" unless it is.
- [ ] A buyer's `/account` shows the purchases dashboard with correct
      counts per tab; a seller's and an admin's do not.
- [ ] P95 page time stays under 2.5s with the two extra rails (measure on
      the dev server with the demo seed, report the numbers).
- [ ] Works at 320px, 24px font, high contrast, reduced motion, keyboard
      only. `npm run verify` exits 0.
