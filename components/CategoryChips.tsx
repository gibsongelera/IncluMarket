import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBagShopping,
  faBowlFood,
  faBoxOpen,
  faGem,
  faPalette,
  faScissors,
  faShirt,
  faSpa,
  faStore,
} from "@fortawesome/free-solid-svg-icons";
import type { Category } from "@/lib/types";

const CAT_ICONS: Record<string, IconDefinition> = {
  bags: faBagShopping,
  apparel: faShirt,
  crafts: faScissors,
  food: faBowlFood,
  accessories: faGem,
  wellness: faSpa,
  services: faPalette,
};
// One designated colour per category, extending the core palette.
const CAT_COLORS: Record<string, string> = {
  bags: "var(--palette-deep)",
  apparel: "var(--palette-teal)",
  crafts: "var(--palette-olive)",
  food: "var(--palette-primary-dark)",
  accessories: "var(--palette-plum)",
  wellness: "var(--palette-forest)",
  services: "var(--palette-rose)",
};

/**
 * Category folders as links (they were buttons that filtered in the
 * browser): each one is a real URL, works without JavaScript, and can be
 * shared or bookmarked. The selected one is marked with aria-current.
 */
export function CategoryChips({
  categories,
  counts,
  total,
  current,
  hrefFor,
}: {
  categories: Category[];
  counts: Record<string, number>;
  total: number;
  current?: string;
  hrefFor: (categoryId: string | null) => string;
}) {
  const visible = categories.filter((c) => (counts[c.id] ?? 0) > 0 || c.id === current);
  return (
    <nav className="category-strip" aria-labelledby="cats-title">
      <h2 id="cats-title">Shop by category</h2>
      <ul className="category-chips" role="list">
        <li>
          <Link
            className={`category-chip${!current ? " is-active" : ""}`}
            href={hrefFor(null)}
            aria-current={!current ? "page" : undefined}
            scroll={false}
          >
            <span className="chip-emoji" aria-hidden="true">
              <FontAwesomeIcon icon={faStore} style={{ color: !current ? undefined : "var(--palette-primary)" }} />
            </span>{" "}
            All items
            <span className="chip-count">
              {total}
              <span className="sr-only"> products</span>
            </span>
          </Link>
        </li>
        {visible.map((c) => {
          const active = current === c.id;
          return (
            <li key={c.id}>
              <Link
                className={`category-chip${active ? " is-active" : ""}`}
                href={hrefFor(c.id)}
                aria-current={active ? "page" : undefined}
                scroll={false}
              >
                <span className="chip-emoji" aria-hidden="true">
                  <FontAwesomeIcon
                    icon={CAT_ICONS[c.id] || faBoxOpen}
                    style={{ color: active ? undefined : CAT_COLORS[c.id] || "var(--text-muted)" }}
                  />
                </span>{" "}
                {c.folder || c.label}
                <span className="chip-count">
                  {counts[c.id] ?? 0}
                  <span className="sr-only"> products</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
