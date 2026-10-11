import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBagShopping,
  faBook,
  faBowlFood,
  faBoxOpen,
  faCouch,
  faGem,
  faMugHot,
  faPalette,
  faScissors,
  faShirt,
  faSpa,
  faStore,
} from "@fortawesome/free-solid-svg-icons";
import type { Category } from "@/lib/types";
import type { CategoryIconKey } from "@/lib/category-icons";

// The icon an admin chose (migration 0020), else the seed category's own.
const ICON_BY_KEY: Record<CategoryIconKey, IconDefinition> = {
  "bag-shopping": faBagShopping,
  shirt: faShirt,
  scissors: faScissors,
  "bowl-food": faBowlFood,
  "mug-hot": faMugHot,
  gem: faGem,
  spa: faSpa,
  palette: faPalette,
  book: faBook,
  couch: faCouch,
  "box-open": faBoxOpen,
};
const CAT_ICONS: Record<string, IconDefinition> = {
  bags: faBagShopping,
  apparel: faShirt,
  crafts: faScissors,
  food: faBowlFood,
  accessories: faGem,
  wellness: faSpa,
  services: faPalette,
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
              <FontAwesomeIcon icon={faStore} />
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
                  <FontAwesomeIcon icon={ICON_BY_KEY[c.icon as CategoryIconKey] || CAT_ICONS[c.id] || faBoxOpen} />
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
