"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { suggestProducts } from "@/lib/actions/search";
import type { Suggestions } from "@/lib/storefront-core";
import { money } from "@/lib/format";
import { Icon } from "./Icon";

const RECENT_KEY = "im_recent_searches";
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const t = q.trim();
  if (!t) return;
  try {
    const next = [t, ...readRecent().filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: recent searches are a convenience.
  }
}

type Option =
  | { kind: "recent"; label: string; href: string }
  | { kind: "product"; label: string; href: string; price: number; salePercent: number | null; image: string | null }
  | { kind: "category"; label: string; href: string }
  | { kind: "seller"; label: string; href: string }
  | { kind: "all"; label: string; href: string };

const GROUP_LABEL: Record<Option["kind"], string> = {
  recent: "Recent searches",
  product: "Products",
  category: "Categories",
  seller: "Sellers",
  all: "",
};

/**
 * Header search (combobox). Typing suggests products — photo, price paid,
 * typo-tolerant — plus matching categories and sellers; an empty box offers
 * recent searches (kept only in this browser). Enter searches /search, which
 * has the filters. Arrow keys move through every suggestion; Escape closes.
 */
export function SearchBox({
  initialQ = "",
  idBase = "search",
}: {
  initialQ?: string;
  /** Prefix for element ids; give a second search box on a page its own. */
  idBase?: string;
}) {
  const router = useRouter();
  // Fixed ids rather than useId(): the header renders inside streamed
  // boundaries, and a generated id differed between server and client.
  const inputId = `${idBase}-input`;
  const listboxId = `${idBase}-suggestions`;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [q, setQ] = useState(initialQ);
  const [found, setFound] = useState<Suggestions>({ products: [], categories: [], sellers: [] });
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const text = q.trim();
    if (text.length < 2) {
      setFound({ products: [], categories: [], sellers: [] });
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setFound(await suggestProducts(text));
      } catch {
        setFound({ products: [], categories: [], sellers: [] });
      }
      setActiveIndex(-1);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const options = useMemo<Option[]>(() => {
    const text = q.trim();
    if (text.length < 2) {
      return recent.map((r) => ({ kind: "recent" as const, label: r, href: `/search?q=${encodeURIComponent(r)}` }));
    }
    const list: Option[] = [
      ...found.products.map((p) => ({
        kind: "product" as const,
        label: p.title,
        href: `/buyer/product/${p.id}`,
        price: p.price,
        salePercent: p.salePercent,
        image: p.image,
      })),
      ...found.categories.map((c) => ({ kind: "category" as const, label: c.label, href: `/search?cat=${encodeURIComponent(c.id)}` })),
      ...found.sellers.map((s) => ({ kind: "seller" as const, label: s.name, href: `/shop/${s.id}` })),
    ];
    list.push({ kind: "all", label: `Search for “${text}”`, href: `/search?q=${encodeURIComponent(text)}` });
    return list;
  }, [q, found, recent]);

  useEffect(() => {
    setOpen(focused && options.length > 0);
  }, [focused, options.length]);

  function go(option: Option) {
    setOpen(false);
    if (option.kind === "recent" || option.kind === "all") saveRecent(option.kind === "all" ? q : option.label);
    router.push(option.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      go(options[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Group consecutive options by kind for headings, keeping one flat index.
  const groups: { kind: Option["kind"]; items: { option: Option; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const last = groups[groups.length - 1];
    if (last && last.kind === option.kind) last.items.push({ option, index });
    else groups.push({ kind: option.kind, items: [{ option, index }] });
  });

  return (
    <form
      className="search"
      role="search"
      action="/search"
      onSubmit={() => {
        saveRecent(q);
        setOpen(false);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Search products
      </label>
      <div className="search__combobox">
        <input
          id={inputId}
          name="q"
          type="search"
          placeholder="Search PWD-made products…"
          autoComplete="off"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setRecent(readRecent());
            setFocused(true);
          }}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        />
        {open ? (
          <div className="search__suggestions" role="listbox" id={listboxId} aria-label="Suggestions">
            {groups.map((g) => (
              <div key={g.kind + g.items[0].index} role="group" aria-label={GROUP_LABEL[g.kind] || undefined}>
                {GROUP_LABEL[g.kind] ? (
                  <div className="search__group" aria-hidden="true">
                    {GROUP_LABEL[g.kind]}
                    {g.kind === "recent" ? (
                      <button
                        type="button"
                        className="search__clear"
                        tabIndex={-1}
                        // Keep focus in the search box while clicking.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          try {
                            localStorage.removeItem(RECENT_KEY);
                          } catch {}
                          setRecent([]);
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {g.items.map(({ option, index }) => (
                  <div
                    key={index}
                    id={`${listboxId}-opt-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`search__suggestion search__suggestion--${option.kind}${index === activeIndex ? " is-active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(option);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {option.kind === "product" ? (
                      <>
                        <span className="search__thumb" aria-hidden="true">
                          {option.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={option.image} alt="" />
                          ) : (
                            option.label.charAt(0).toUpperCase()
                          )}
                        </span>
                        <span className="search__label">{option.label}</span>
                        <span className="search__price">
                          {money(option.price)}
                          {option.salePercent ? <span className="sr-only"> on sale</span> : null}
                        </span>
                      </>
                    ) : (
                      <>
                        <Icon
                          name={option.kind === "seller" ? "user" : option.kind === "category" ? "grid" : "search"}
                          size={14}
                        />
                        <span className="search__label">{option.label}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button type="submit" className="btn btn--primary" aria-label="Search">
        <Icon name="search" size={18} />
        <span>Search</span>
      </button>
    </form>
  );
}
