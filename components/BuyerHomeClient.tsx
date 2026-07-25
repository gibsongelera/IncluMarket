"use client";

import { useMemo, useState } from "react";
import type { Category, Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";

const CAT_ICONS: Record<string, string> = {
  bags: "👜",
  apparel: "🧣",
  crafts: "🧺",
  food: "🥭",
  accessories: "💎",
  wellness: "🕯️",
  services: "🎨",
};

export function BuyerHomeClient({
  products,
  categories,
  stock,
  ratingAvg,
  ratingCount,
  initialQ,
  initialCat,
}: {
  products: Product[];
  categories: Category[];
  stock: Record<number, number>;
  ratingAvg: Record<number, number>;
  ratingCount: Record<number, number>;
  initialQ: string;
  initialCat: string;
}) {
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
  });

  const catLabel = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => (map[c.id] = c.folder || c.label));
    return map;
  }, [categories]);

  function apply() {
    setApplied({
      q: q.trim().toLowerCase(),
      category,
      min: Number(min) || 0,
      max: Number(max) || Infinity,
      rating,
    });
  }

  function clearAll() {
    setQ("");
    setCategory("");
    setMin("");
    setMax("");
    setRating(0);
    setApplied({ q: "", category: "", min: 0, max: Infinity, rating: 0 });
  }

  function selectCategory(id: string) {
    setCategory(id);
    setApplied((a) => ({ ...a, category: id }));
  }

  const results = useMemo(() => {
    return products.filter((p) => {
      if (
        applied.q &&
        p.title.toLowerCase().indexOf(applied.q) < 0 &&
        (p.description || "").toLowerCase().indexOf(applied.q) < 0
      )
        return false;
      if (applied.category && p.category !== applied.category) return false;
      if (p.base_price < applied.min || p.base_price > applied.max) return false;
      if (applied.rating && (ratingAvg[p.id] || 0) < applied.rating) return false;
      return true;
    });
  }, [products, applied, ratingAvg]);

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
                🛍️
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
                    {CAT_ICONS[c.id] || "📦"}
                  </span>{" "}
                  {folder}
                  <span className="chip-count">{cnt}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="feed-head">
          <h1 id="feed-title">Discover</h1>
          <p className="muted">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
        </div>

        {results.length === 0 ? (
          <p className="empty">No products match your filters.</p>
        ) : (
          <div className="product-grid" aria-live="polite">
            {results.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                stock={stock[p.id] || 0}
                rating={ratingAvg[p.id] || 0}
                ratingCount={ratingCount[p.id] || 0}
                categoryLabel={catLabel[p.category || ""] || p.category || "Uncategorized"}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
