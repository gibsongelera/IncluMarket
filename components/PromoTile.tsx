import Link from "next/link";
import type { FeaturedShopLite } from "@/lib/shops";
import type { HeroPromo, StorefrontItem } from "@/lib/storefront-core";
import { formatDateTime, money } from "@/lib/format";
import { Countdown } from "./Countdown";
import { Icon } from "./Icon";

/**
 * The hero's side tile (P4-03, 05 #3, 01 §6.5): built from data, never an
 * uploaded image. heroPromo() in lib/storefront-core.ts picks it: the live
 * flash sale, else the first featured PWD shop.
 *
 * One link per tile, on the title, so its accessible name is the product
 * title or the shop name and nothing else. Its ::after covers the tile, so the
 * whole tile is the target without nesting anything inside a link; the price,
 * the countdown's end time and the story are read as text after it. The
 * picture is decorative (alt=""): the title beside it already names it.
 *
 * Layout (styles/layout.css, the wide form in responsive.css): the picture
 * above the words while the tile is narrow (the 1/3 column, phones); from a
 * 34rem tile (container query, so it follows the text setting) the picture on
 * the left, the words on the right.
 */
export function PromoTile({ promo }: { promo: NonNullable<HeroPromo<FeaturedShopLite>> }) {
  return promo.kind === "flash" ? <FlashTile item={promo.item} endsAt={promo.endsAt} /> : <ShopTile shop={promo.shop} />;
}

/**
 * The story as the tile shows it: about three lines, cut at a word with an
 * ellipsis. Cut here rather than only by the CSS clamp, so a screen reader
 * hears what a sighted reader sees; the full story is on the shop page.
 */
function shortStory(story: string, max = 140): string {
  const s = story.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : s.slice(0, max)).replace(/[\s,.;:!?-]+$/, "")}…`;
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function FlashTile({ item, endsAt }: { item: StorefrontItem; endsAt: string }) {
  const reduced = item.effectivePrice < item.basePrice;
  return (
    <article className="promo-tile promo-tile--flash">
      <div className="promo-tile__body">
        <div className="promo-tile__media promo-tile__media--product">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- product photo (storage URL or an older data URL)
            <img src={item.image} alt="" loading="eager" decoding="async" />
          ) : (
            <span className="promo-tile__initial" aria-hidden="true">
              {initialOf(item.title)}
            </span>
          )}
        </div>
        <div className="promo-tile__text">
          <h3 className="promo-tile__title">
            <span className="promo-tile__eyebrow">Flash sale</span>
            <Link className="promo-tile__link" href={`/buyer/product/${item.id}`} prefetch={false}>
              {item.title}
            </Link>
          </h3>
          <p className="promo-tile__price">
            <span className={reduced ? "price price--sale" : "price"}>{money(item.effectivePrice)}</span>
            {reduced ? (
              <s className="price price--was">
                <span className="sr-only">was </span>
                {money(item.basePrice)}
              </s>
            ) : null}
            {item.salePercent ? <span className="badge badge--sale">{item.salePercent}% off</span> : null}
          </p>
          <p className="promo-tile__ends">
            <Countdown endsAt={endsAt} label={`Ends ${formatDateTime(endsAt)}`} />
          </p>
        </div>
      </div>
    </article>
  );
}

function ShopTile({ shop }: { shop: FeaturedShopLite }) {
  const n = shop.productCount;
  return (
    <article className="promo-tile promo-tile--shop">
      <div className="promo-tile__body">
        <div className="promo-tile__media promo-tile__media--shop">
          {shop.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- shop logo from storage
            <img className="promo-tile__logo" src={shop.logo} alt="" decoding="async" />
          ) : (
            <span className="promo-tile__avatar" aria-hidden="true">
              {initialOf(shop.name)}
            </span>
          )}
        </div>
        <div className="promo-tile__text">
          <h3 className="promo-tile__title">
            <span className="promo-tile__eyebrow">Featured PWD shop</span>
            <Link className="promo-tile__link" href={`/shop/${shop.id}`}>
              {shop.name}
            </Link>
          </h3>
          {shop.verified ? (
            <p className="promo-tile__badges">
              <span className="badge badge--verified">
                <Icon name="check" size={12} /> Verified PWD seller
              </span>
            </p>
          ) : null}
          {shop.story ? <p className="promo-tile__story">{shortStory(shop.story)}</p> : null}
          <p className="promo-tile__meta">
            {n} {n === 1 ? "product" : "products"}
          </p>
        </div>
      </div>
    </article>
  );
}
