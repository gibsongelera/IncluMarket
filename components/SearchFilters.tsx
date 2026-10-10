"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ADAPTIVE_TAGS, type StorefrontQuery } from "@/lib/storefront-core";
import type { Category } from "@/lib/types";

/**
 * Filters for /search. A plain GET form: without JavaScript, Apply submits
 * it. With JavaScript every change applies at once (prices after a short
 * pause, or Enter), and the URL is updated so the result can be shared.
 */
export function SearchFilters({ query, categories }: { query: StorefrontQuery; categories: Category[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Before hydration (or without JavaScript) "Clear all" is a plain link.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  function apply(delay = 0) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const data = new FormData(form);
      const p = new URLSearchParams();
      for (const key of ["q", "cat", "min", "max", "rating", "sort", "verified"]) {
        const v = String(data.get(key) ?? "").trim();
        if (v && !(key === "rating" && v === "0")) p.set(key, v);
      }
      const tags = data.getAll("tags").map(String).filter(Boolean);
      if (tags.length) p.set("tags", tags.join(","));
      router.replace(`/search?${p.toString()}`, { scroll: false });
    }, delay);
  }

  function clearAll() {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (el.type === "hidden") continue;
      if (el.type === "checkbox") el.checked = false;
      else if (el.type === "radio") el.checked = el.value === "0";
      else if (el.tagName === "SELECT" || el.type === "number") el.value = "";
    }
    apply();
  }

  const clearHref = query.q ? `/search?q=${encodeURIComponent(query.q)}` : "/search";

  return (
    <form
      ref={formRef}
      className="search-filters"
      action="/search"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.sort && query.sort !== (query.q ? "relevance" : "latest") ? (
        <input type="hidden" name="sort" value={query.sort} />
      ) : null}

      <div className="field">
        <label htmlFor="filter-category">Category</label>
        <select id="filter-category" name="cat" defaultValue={query.category ?? ""} onChange={() => apply()}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.folder || c.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="field">
        <legend>Price you pay (₱)</legend>
        <div className="row price-row">
          <label className="price-row__item">
            <span className="hint">From</span>
            <input
              type="number"
              name="min"
              min={0}
              inputMode="numeric"
              defaultValue={query.min ?? ""}
              onChange={() => apply(700)}
            />
          </label>
          <label className="price-row__item">
            <span className="hint">To</span>
            <input
              type="number"
              name="max"
              min={0}
              inputMode="numeric"
              defaultValue={query.max ?? ""}
              onChange={() => apply(700)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Rating</legend>
        <div className="rating-row">
          {[0, 3, 4].map((r) => (
            <label key={r} className="radio">
              <input
                type="radio"
                name="rating"
                value={r}
                defaultChecked={(query.rating ?? 0) === r}
                onChange={() => apply()}
              />
              {r === 0 ? "Any" : `${r} stars and up`}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>PWD-friendly features</legend>
        {ADAPTIVE_TAGS.map((t) => (
          <label key={t.key} className="radio">
            <input
              type="checkbox"
              name="tags"
              value={t.key}
              defaultChecked={query.tags?.includes(t.key)}
              onChange={() => apply()}
            />
            {t.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="field">
        <legend>Seller</legend>
        <label className="radio">
          <input type="checkbox" name="verified" value="1" defaultChecked={query.verified} onChange={() => apply()} />
          Verified PWD sellers only
        </label>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn btn--primary">
          Apply
        </button>
        {/* With JavaScript, clears the fields in place so the form stays
            mounted and focus is not lost; otherwise a plain link. */}
        {hydrated ? (
          <button type="button" className="btn btn--ghost" onClick={clearAll}>
            Clear all
          </button>
        ) : (
          <Link className="btn btn--ghost" href={clearHref}>
            Clear all
          </Link>
        )}
      </div>
    </form>
  );
}
