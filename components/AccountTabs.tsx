"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCOUNT_TABS, type NavRole } from "@/lib/nav";

/**
 * Section links inside /account. Links, not an ARIA tablist: each section is
 * its own page with its own URL, so aria-current marks where you are.
 */
export function AccountTabs({ role }: { role: Exclude<NavRole, "guest"> }) {
  const pathname = usePathname();
  const tabs = ACCOUNT_TABS.filter((t) => t.roles.includes(role));
  return (
    <nav className="tabs account-tabs" aria-label="Account sections">
      {tabs.map((t) => {
        const current = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`tab${current ? " tab--active" : ""}`}
            aria-current={current ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
