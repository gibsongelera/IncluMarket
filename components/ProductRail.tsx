import Link from "next/link";
import type { ReactNode } from "react";
import type { StorefrontItem } from "@/lib/storefront-core";
import { Icon } from "./Icon";
import { RailScroller } from "./RailScroller";
import { StorefrontCard } from "./StorefrontGrid";

/**
 * A /home product rail (P4-05, 05 §2, 01 §6.4-6.5): Today's deals, Featured
 * products, the two "Best sellers in …" rails and Picked for you all use this
 * one component.
 *
 *   - The section header: the h2 on the left, "View all" on the right only
 *     where a page really lists the rest (05: never a link to nowhere), then
 *     RailScroller's Previous / Next from 768px while the row overflows.
 *   - The list of cards is named by the h2 (its id is `id`); the section
 *     itself is not named again.
 *   - `meta` sits with the heading: the deals countdown beside it, the
 *     "why am I seeing this?" disclosure under it. Reading order is the
 *     visual order: heading, meta, View all, buttons, cards.
 *   - No items, no section: no heading, no empty rail.
 *   - Phones: the first four cards only (styles/layout.css; responsive.css
 *     shows the rest from 768px). "View all", where there is one, and
 *     Discover and /search list every product.
 */
export function ProductRail({
  id,
  title,
  label,
  items,
  wishlistIds,
  showWishlist,
  meta,
  viewAll,
  capOnPhones = true,
}: {
  /** The h2's id; the list of cards is labelled by it. */
  id: string;
  title: string;
  /** What Previous / Next scroll: "deals" names them "Previous deals". */
  label: string;
  items: StorefrontItem[];
  wishlistIds: number[];
  showWishlist: boolean;
  meta?: ReactNode;
  /** `name` completes the link's accessible name: "View all <name>". */
  viewAll?: { href: string; name: string };
  /** Phones show the first four cards; false for a rail no other page lists (the deals). */
  capOnPhones?: boolean;
}) {
  if (!items.length) return null;
  const saved = new Set(wishlistIds);
  const heading = <h2 id={id}>{title}</h2>;
  return (
    <section className={`home-section product-rail${capOnPhones ? " product-rail--capped" : ""}`}>
      <RailScroller
        label={label}
        ariaLabelledby={id}
        heading={
          meta ? (
            <div className="section-head__title">
              {heading}
              {meta}
            </div>
          ) : (
            heading
          )
        }
        actions={
          viewAll ? (
            <Link className="section-head__link" href={viewAll.href}>
              View all<span className="sr-only">&nbsp;{viewAll.name}</span> <Icon name="arrow-right" />
            </Link>
          ) : undefined
        }
      >
        {items.map((i) => (
          <StorefrontCard key={i.id} item={i} wishlisted={saved.has(i.id)} showWishlist={showWishlist} />
        ))}
      </RailScroller>
    </section>
  );
}
