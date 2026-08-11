"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { suggestProducts, type ProductSuggestion } from "@/lib/actions/search";
import { Icon } from "./Icon";

export function SearchBox({ initialQ = "" }: { initialQ?: string }) {
  const router = useRouter();
  const listboxId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [q, setQ] = useState(initialQ);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await suggestProducts(q);
      setSuggestions(results);
      setOpen(results.length > 0);
      setActiveIndex(-1);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  function goToSuggestion(s: ProductSuggestion) {
    setOpen(false);
    router.push(`/buyer/product/${s.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      goToSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="search"
      role="search"
      action="/home"
      onSubmit={() => setOpen(false)}
    >
      <label htmlFor="search-input" className="sr-only">
        Search products
      </label>
      <div className="search__combobox">
        <input
          id="search-input"
          name="q"
          type="search"
          placeholder="Search PWD-made products…"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        />
        {open ? (
          <ul className="search__suggestions" role="listbox" id={listboxId}>
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`search__suggestion${i === activeIndex ? " is-active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  goToSuggestion(s);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <Icon name="search" size={14} />
                {s.title}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="submit" className="btn btn--primary" aria-label="Search">
        <Icon name="search" size={18} />
        <span>Search</span>
      </button>
    </form>
  );
}
