"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { isCurrent, navSections, type NavRole } from "@/lib/nav";

/**
 * Seller Centre / Admin sidebar, shown from 1024px (lg) up. Below that the
 * header links (md) and the phone tab bar take over — the same items, from
 * lib/nav.ts. The current page is marked with aria-current, not colour alone.
 *
 * `badges` puts a count on an item, keyed by its href:
 * `{ "/admin/verifications": 3 }` draws a pill and names the link
 * "Verifications 3 waiting". A missing key, 0 or less draws nothing.
 */
export function ConsoleNav({
  variant,
  badges,
}: {
  variant: Extract<NavRole, "seller" | "admin">;
  badges?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname() || "";
  const label = variant === "admin" ? "Admin console" : "Seller Centre";
  return (
    <nav className="console-nav" aria-label={label}>
      <p className="console-nav__title">{label}</p>
      {navSections(variant).map((group) => (
        <div className="console-nav__group" key={group.section || "main"}>
          {group.section ? <p className="console-nav__section">{group.section}</p> : null}
          <ul>
            {group.items.map((item) => {
              const current = isCurrent(pathname, item);
              const count = badges?.[item.href] ?? 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`console-nav__link${current ? " is-current" : ""}`}
                    aria-current={current ? "page" : undefined}
                  >
                    <span className="console-nav__icon" aria-hidden="true">
                      <Icon name={item.icon} size={18} />
                    </span>
                    {item.label}
                    {count > 0 ? (
                      <>
                        {/* The space keeps "Verifications 3 waiting" apart in
                            the link's name; it collapses on screen. */}
                        {" "}
                        <span className="console-nav__badge">
                          {count}
                          {/* A no-break space: .sr-only is absolutely
                              positioned, so a plain leading space collapses
                              and the name read "3waiting" (as in Chart.tsx). */}
                          <span className="sr-only">{" waiting"}</span>
                        </span>
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
