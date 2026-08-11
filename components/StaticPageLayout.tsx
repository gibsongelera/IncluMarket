import Link from "next/link";
import { SiteFooter } from "./SiteFooter";

export function StaticPageLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="static-header" role="banner">
        <div className="container">
          <Link className="brand" href="/" aria-label="IncluMarket home">
            <span className="brand-mark" aria-hidden="true">
              IM
            </span>
            <span className="brand-word">IncluMarket</span>
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="container static-page">
        <article className="prose">
          <h1>{title}</h1>
          {children}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
