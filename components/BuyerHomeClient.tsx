"use client";

import { useMemo, useState } from "react";
import type { Category, FlashSale, Product } from "@/lib/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faStore,
  faBagShopping,
  faShirt,
  faScissors,
  faBowlFood,
  faGem,
  faSpa,
  faPalette,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";

type SellerLite = { id: number; name: string; seller_story: string | null };
import { ProductCard } from "./ProductCard";
import { Icon } from "./Icon";

const ALL_ITEMS_ICON = faStore;
const ALL_ITEMS_COLOR = "var(--palette-primary)";
const FALLBACK_CAT_ICON = faBoxOpen;
const FALLBACK_CAT_COLOR = "var(--text-muted)";
const CAT_ICONS: Record<string, IconDefinition> = {
  bags: faBagShopping,
  apparel: faShirt,
  crafts: faScissors,
  food: faBowlFood,
  accessories: faGem,
  wellness: faSpa,
  services: faPalette,
};
// One designated color per category, extending the core brand palette
// rather than clashing with it (see styles/tokens.css).
const CAT_COLORS: Record<string, string> = {
  bags: "var(--palette-deep)",
  apparel: "var(--palette-teal)",
  crafts: "var(--palette-olive)",
  food: "var(--palette-primary-dark)",
  accessories: "var(--palette-plum)",
  wellness: "var(--palette-forest)",
  services: "var(--palette-rose)",
};

type SortKey = "newest" | "price_asc" | "price_desc" | "rating" | "popularity";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Highest rated",
  popularity: "Most popular",
};

export function BuyerHomeClient({
  products,
  categories,
  stock,
  ratingAvg,
  ratingCount,
  popularity,
  initialQ,
  initialCat,
  initialSeller,
  wishlistIds,
  featured,
  flashSales,
  featuredSellers,
  isGuest,
}: {
  products: Product[];
  categories: Category[];
  stock: Record<number, number>;
  ratingAvg: Record<number, number>;
  ratingCount: Record<number, number>;
  popularity: Record<number, number>;
  initialQ: string;
  initialCat: string;
  initialSeller: number;
  wishlistIds: number[];
  featured: Product[];
  flashSales: Record<number, FlashSale>;
  featuredSellers: SellerLite[];
  isGuest: boolean;
}) {
  const wishlistSet = useMemo(() => new Set(wishlistIds), [wishlistIds]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCat);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [rating, setRating] = useState(0);
  // applied state (Apply button), initialized to the URL params
  const [applied, setApplied] = useState({
    q: initialQ.toLowerCase(),
    category: initialCat,
    min: 0,
    max: Infinity,
    rating: 0,
    seller: initialSeller || 0,
  });

  const catLabel = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => (map[c.id] = c.folder || c.label));
    return map;
  }, [categories]);

  function apply() {
    setApplied((a) => ({
      ...a,
      q: q.trim().toLowerCase(),
      category,
      min: Number(min) || 0,
      max: Number(max) || Infinity,
      rating,
    }));
  }

  function clearAll() {
    setQ("");
    setCategory("");
    setMin("");
    setMax("");
    setRating(0);
    setApplied({ q: "", category: "", min: 0, max: Infinity, rating: 0, seller: 0 });
  }

  function selectCategory(id: string) {
    setCategory(id);
    setApplied((a) => ({ ...a, category: id }));
  }

  function selectSeller(id: number) {
    setApplied((a) => ({ ...a, seller: a.seller === id ? 0 : id }));
  }

  const results = useMemo(() => {
    const filtered = products.filter((p) => {
      if (
        applied.q &&
        p.title.toLowerCase().indexOf(applied.q) < 0 &&
        (p.description || "").toLowerCase().indexOf(applied.q) < 0
      )
        return false;
      if (applied.category && p.category !== applied.category) return false;
      if (applied.seller && p.seller_id !== applied.seller) return false;
      if (p.base_price < applied.min || p.base_price > applied.max) return false;
      if (applied.rating && (ratingAvg[p.id] || 0) < applied.rating) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (sort) {
      case "price_asc":
        sorted.sort((a, b) => a.base_price - b.base_price);
        break;
      case "price_desc":
        sorted.sort((a, b) => b.base_price - a.base_price);
        break;
      case "rating":
        sorted.sort((a, b) => (ratingAvg[b.id] || 0) - (ratingAvg[a.id] || 0));
        break;
      case "popularity":
        sorted.sort((a, b) => (popularity[b.id] || 0) - (popularity[a.id] || 0));
        break;
      case "newest":
      default:
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [products, applied, ratingAvg, popularity, sort]);

  const showRails = !applied.q && !applied.category && !applied.seller;
  const recommended = useMemo(() => {
    const featuredIds = new Set(featured.map((p) => p.id));
    return [...products]
      .filter((p) => !featuredIds.has(p.id) && (ratingAvg[p.id] || 0) > 0)
      .sort((a, b) => (ratingAvg[b.id] || 0) - (ratingAvg[a.id] || 0))
      .slice(0, 6);
  }, [products, featured, ratingAvg]);

  function renderCard(p: Product) {
    return (
      <ProductCard
        key={p.id}
        product={p}
        stock={stock[p.id] || 0}
        rating={ratingAvg[p.id] || 0}
        ratingCount={ratingCount[p.id] || 0}
        categoryLabel={catLabel[p.category || ""] || p.category || "Uncategorized"}
        wishlisted={wishlistSet.has(p.id)}
        showWishlist={!isGuest}
        flashSale={flashSales[p.id] ? { discountPercent: Number(flashSales[p.id].discount_percent) } : null}
      />
    );
  }

  return (
    <>
      <aside className="filters" aria-labelledby="filters-title">
        <h2 id="filters-title">Filters</h2>
        <div className="field">
          <label htmlFor="filter-category">Category</label>
          <select
            id="filter-category"
            value={category}
            onChange={(e) => selectCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="field">
          <legend>Price range (PHP)</legend>
          <div className="row">
            <input
              type="number"
              min={0}
              placeholder="Min"
              aria-label="Minimum price"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
            <input
              type="number"
              min={0}
              placeholder="Max"
              aria-label="Maximum price"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Minimum rating</legend>
          <div className="row rating-row">
            {[0, 3, 4, 5].map((r) => (
              <label key={r}>
                <input
                  type="radio"
                  name="rating"
                  value={r}
                  checked={rating === r}
                  onChange={() => setRating(r)}
                />{" "}
                {r === 0 ? "Any" : r === 5 ? "5" : `${r}+`}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={apply}>
            Apply
          </button>
          <button type="button" className="btn btn--ghost" onClick={clearAll}>
            Clear
          </button>
        </div>
      </aside>

      <section className="feed" aria-labelledby="feed-title">
        <h1 className="sr-only">Shop IncluMarket</h1>
        <section className="category-strip" aria-labelledby="cats-title">
          <h2 id="cats-title">Shop by category folder</h2>
          <p className="category-folder-hint">
            Browse items grouped into folders such as Bags, Apparel, Crafts, and Food.
          </p>
          <div className="category-chips" role="group" aria-label="Category folders">
            <button
              type="button"
              className={`category-chip ${applied.category === "" ? "is-active" : ""}`}
              aria-pressed={applied.category === ""}
              onClick={() => selectCategory("")}
            >
              <span className="chip-emoji" aria-hidden="true">
                <FontAwesomeIcon icon={ALL_ITEMS_ICON} style={{ color: ALL_ITEMS_COLOR }} />
              </span>{" "}
              All Items
              <span className="chip-count">{products.length}</span>
            </button>
            {categories.map((c) => {
              const cnt = products.filter((p) => p.category === c.id).length;
              const active = applied.category === c.id;
              const folder = c.folder || c.label;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`category-chip ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  title={`Open ${folder} folder`}
                  onClick={() => selectCategory(c.id)}
                >
                  <span className="chip-emoji" aria-hidden="true">
                    <FontAwesomeIcon
                      icon={CAT_ICONS[c.id] || FALLBACK_CAT_ICON}
                      style={{ color: CAT_COLORS[c.id] || FALLBACK_CAT_COLOR }}
                    />
                  </span>{" "}
                  {folder}
                  <span className="chip-count">{cnt}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="feed-head">
          <h2 id="feed-title">Discover</h2>
          <p className="muted">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          <div className="field sort-field">
            <label htmlFor="sort-select">
              <Icon name="sort" size={16} /> Sort by
            </label>
            <select
              id="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showRails && featuredSellers.length ? (
          <section className="rail" aria-labelledby="sellers-title">
            <h2 id="sellers-title">Featured PWD sellers</h2>
            <div className="seller-rail">
              {featuredSellers.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="seller-card"
                  aria-label={`Shop products from ${s.name}`}
                  onClick={() => selectSeller(s.id)}
                >
                  <span className="seller-card__avatar" aria-hidden="true">
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="seller-card__name" aria-hidden="true">
                    {s.name}
                  </span>
                  {s.seller_story ? (
                    <span className="seller-card__story" aria-hidden="true">
                      {s.seller_story}
                    </span>
                  ) : null}
                  <span className="badge badge--featured" aria-hidden="true">
                    Shop this seller
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {applied.seller ? (
          <p className="filter-bar__count">
            Showing products from{" "}
            <strong>{featuredSellers.find((s) => s.id === applied.seller)?.name || "this seller"}</strong>{" "}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => selectSeller(0)}>
              Clear
            </button>
          </p>
        ) : null}

        {showRails && featured.length ? (
          <section className="rail" aria-labelledby="featured-title">
            <h2 id="featured-title">Featured products</h2>
            <div className="product-grid">{featured.map(renderCard)}</div>
          </section>
        ) : null}

        {showRails && recommended.length ? (
          <section className="rail" aria-labelledby="recommended-title">
            <h2 id="recommended-title">Recommended for you</h2>
            <div className="product-grid">{recommended.map(renderCard)}</div>
          </section>
        ) : null}

        {results.length === 0 ? (
          <p className="empty">No products match your filters.</p>
        ) : (
          <div className="product-grid" aria-live="polite">
            {results.map(renderCard)}
          </div>
        )}
      </section>
    </>
  );
}
