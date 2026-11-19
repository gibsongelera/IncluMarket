import Link from "next/link";
import type { FeaturedShopLite } from "@/lib/shops";
import { Icon } from "./Icon";

/** Two rows of four from 1024px (05 §2). */
const MAX_CARDS = 8;

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Shops by PWD sellers (P4-05, 05 #7, 01 §6.5): a grid of store cards, 4
 * columns from 1024px, 2 from 600px, 1 below (responsive.css), at most 8.
 * No "View all": there is no shop directory to send it to.
 *
 * Each card: white, 1px border, --radius-md; the 3rem round logo (alt="",
 * the name beside it says who) or the initial; the shop name; the verified
 * PWD badge; "n products". One link per card, on the name, so the link's
 * accessible name is the shop name alone; its ::after covers the card, so
 * the whole card is the target (as PromoTile's). The badge and the count
 * are read as text after it. The list is named by the heading. Public
 * fields only (FeaturedShopLite). No shops: nothing rendered.
 */
export function StoreCards({ shops }: { shops: FeaturedShopLite[] }) {
  if (!shops.length) return null;
  return (
    <section className="home-section">
      <div className="section-head">
        <h2 id="shops-title">Shops by PWD sellers</h2>
      </div>
      <ul className="store-grid" role="list" aria-labelledby="shops-title">
        {shops.slice(0, MAX_CARDS).map((s) => (
          <li key={s.id}>
            <StoreCard shop={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StoreCard({ shop }: { shop: FeaturedShopLite }) {
  const n = shop.productCount;
  return (
    <div className="store-card">
      <div className="store-card__body">
        {shop.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- shop logo from storage
          <img className="store-card__logo" src={shop.logo} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="store-card__avatar" aria-hidden="true">
            {initialOf(shop.name)}
          </span>
        )}
        <div className="store-card__text">
          <h3 className="store-card__name">
            <Link className="store-card__link" href={`/shop/${shop.id}`}>
              {shop.name}
            </Link>
          </h3>
          {shop.verified ? (
            <p className="store-card__badges">
              <span className="badge badge--verified">
                <Icon name="check" size={12} /> Verified PWD seller
              </span>
            </p>
          ) : null}
          <p className="store-card__meta">
            {n.toLocaleString("en-PH")} {n === 1 ? "product" : "products"}
          </p>
        </div>
      </div>
    </div>
  );
}
