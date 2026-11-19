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
import { Icon } from "./Icon";
import { RailScroller } from "./RailScroller";

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

/** "12 products", "1 product": the words are visible, so they are read too. */
function productCount(n: number): string {
  return `${n.toLocaleString("en-PH")} ${n === 1 ? "product" : "products"}`;
}

/**
 * Explore categories (P4-04, 05 #4, 01 §6.5): round icon tiles in a
 * RailScroller rail ("Previous categories" / "Next categories" from 768px,
 * only while the row overflows), "View all" to /search in the header row.
 *
 * Each tile is a real link (they were buttons that filtered in the browser):
 * it works without JavaScript and can be shared or bookmarked. "All items"
 * comes first with the total; a category with no live products is hidden
 * unless it is the selected one, which carries aria-current="page".
 * scroll={false}, so switching category keeps the reader's place.
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
    <nav className="category-nav" aria-labelledby="cats-title">
      <RailScroller
        label="categories"
        trackClassName="rail__track--tiles"
        heading={<h2 id="cats-title">Explore categories</h2>}
        actions={
          <Link className="section-head__link" href="/search">
            View all<span className="sr-only">&nbsp;categories</span> <Icon name="arrow-right" />
          </Link>
        }
      >
        <CategoryTile key="all" href={hrefFor(null)} icon={faStore} name="All items" count={total} selected={!current} />
        {visible.map((c) => (
          <CategoryTile
            key={c.id}
            href={hrefFor(c.id)}
            icon={ICON_BY_KEY[c.icon as CategoryIconKey] || CAT_ICONS[c.id] || faBoxOpen}
            name={c.folder || c.label}
            count={counts[c.id] ?? 0}
            selected={current === c.id}
          />
        ))}
      </RailScroller>
    </nav>
  );
}

/** One tile: the whole tile is the link; the circle and its icon are decoration. */
function CategoryTile({
  href,
  icon,
  name,
  count,
  selected,
}: {
  href: string;
  icon: IconDefinition;
  name: string;
  count: number;
  selected: boolean;
}) {
  return (
    <Link className="category-tile" href={href} aria-current={selected ? "page" : undefined} scroll={false}>
      <span className="category-tile__circle" aria-hidden="true">
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="category-tile__name">{name}</span>{" "}
      <span className="category-tile__count">{productCount(count)}</span>
    </Link>
  );
}
