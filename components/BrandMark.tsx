/**
 * The site's mark: the AVRC III house mark (DSWD Centers and Residential Care
 * Facilities), as AVRC Region IX uses it beside its name. Decorative — every
 * brand link already has a name ("InclusiveMarket home", or "InclusiveMarket
 * Seller home" / "… Admin home" on the consoles) — so the image has no alt
 * and its wrapper is hidden from assistive technology.
 */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/img/partners/avrc-mark.png" alt="" width={128} height={128} />
    </span>
  );
}
