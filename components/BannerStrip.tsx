import Link from "next/link";
import type { BannerLite } from "@/lib/storefront";
import type { FeaturedShopLite } from "@/lib/shops";
import { heroLayout, type HeroPromo } from "@/lib/storefront-core";
import { PromoTile } from "./PromoTile";
import { RailScroller } from "./RailScroller";

/**
 * The /home hero (P4-03, 05 #3, 01 §6.5): the admin's banners as a carousel
 * and a side tile built from data (PromoTile). heroLayout() decides the form:
 *   split     both: carousel 2/3 + tile 1/3 from 1024px, stacked below that
 *   carousel  banners only: the carousel full width
 *   promo     the tile only: full width, as a wide card
 *   none      neither: nothing is rendered, not even the heading
 *
 * The carousel is RailScroller's hero: no autoplay, "Previous promotion" /
 * "Next promotion" and "2 of 4" under the slide, the slide's title said after
 * a press; it drops the carousel roles and buttons for a single banner. Each
 * slide keeps the C-19 rules: the admin's alt text on the image, internal
 * links only (getActiveBanners filters them), the title under the image.
 *
 * `promo` defaults to null, so a caller that passes only banners gets the
 * carousel alone (or nothing), as before.
 */
export function BannerStrip({
  banners,
  promo = null,
}: {
  banners: BannerLite[];
  promo?: HeroPromo<FeaturedShopLite>;
}) {
  const layout = heroLayout(banners.length, promo);
  if (layout === "none") return null;
  return (
    <section className={`home-hero home-hero--${layout}`} aria-labelledby="home-hero-title">
      <h2 id="home-hero-title" className="sr-only">
        Highlights
      </h2>
      {banners.length ? (
        <RailScroller
          variant="hero"
          label="promotion"
          ariaLabel="Promotions"
          slideLabels={banners.map((b) => b.title)}
        >
          {banners.map((b, i) => (
            <BannerSlide key={b.id} banner={b} first={i === 0} />
          ))}
        </RailScroller>
      ) : null}
      {promo ? <PromoTile promo={promo} /> : null}
    </section>
  );
}

function BannerSlide({ banner: b, first }: { banner: BannerLite; first: boolean }) {
  const body = (
    <>
      {/* The first slide is above the fold; the rest load as they scroll in.
          The box has its ratio before the image arrives, so nothing shifts. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed banner */}
      <img className="hero-slide__img" src={b.image} alt={b.alt} loading={first ? "eager" : "lazy"} decoding="async" />
      <span className="hero-slide__title">{b.title}</span>
    </>
  );
  return b.href ? (
    <Link className="hero-slide" href={b.href}>
      {body}
    </Link>
  ) : (
    <div className="hero-slide">{body}</div>
  );
}
