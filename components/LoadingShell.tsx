import Link from "next/link";

/**
 * Frame for loading screens on routes that render their own header (the
 * storefront and buyer pages). Keeps the brand bar in place so the screen
 * does not flash empty; the full header returns with the page. Seller Centre
 * and Admin loading screens need none of this — their layout stays mounted.
 */
export function LoadingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-header site-header--buyer" role="banner">
        <div className="container header-row">
          <Link className="brand" href="/home" aria-label="InclusiveMarket home">
            <span className="brand-mark" aria-hidden="true">
              IM
            </span>
            <span className="brand-word">InclusiveMarket</span>
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="container">
        {children}
      </main>
    </>
  );
}
