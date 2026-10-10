"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { isCurrent, navSections, type NavRole } from "@/lib/nav";

/**
 * Seller Centre / Admin sidebar, shown from 1024px (lg) up. Below that the
 * header links (md) and the phone tab bar take over — the same items, from
 * lib/nav.ts. The current page is marked with aria-current, not colour alone.
 */
export function ConsoleNav({ variant }: { variant: Extract<NavRole, "seller" | "admin"> }) {
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
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`console-nav__link${current ? " is-current" : ""}`}
                    aria-current={current ? "page" : undefined}
                  >
                    <span aria-hidden="true">
                      <Icon name={item.icon} size={18} />
                    </span>
                    {item.label}
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
