import Link from "next/link";
import type { BannerLite } from "@/lib/storefront";

/**
 * Homepage banners (C-19). A plain row, not an auto-rotating carousel:
 * nothing moves on its own, every banner is reachable by keyboard, and each
 * image carries the alt text the admin wrote. Links are internal only.
 */
export function BannerStrip({ banners }: { banners: BannerLite[] }) {
  if (!banners.length) return null;
  return (
    <section className="banners" aria-label="Promotions">
      <ul className="banners__list" role="list">
        {banners.map((b) => {
          const body = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed banner */}
              <img src={b.image} alt={b.alt} loading="lazy" decoding="async" />
              <span className="banners__title">{b.title}</span>
            </>
          );
          return (
            <li key={b.id} className="banners__item">
              {b.href ? (
                <Link className="banners__link" href={b.href}>
                  {body}
                </Link>
              ) : (
                <div className="banners__link">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
