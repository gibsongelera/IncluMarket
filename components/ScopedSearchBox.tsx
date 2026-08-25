"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { suggestScoped, type ScopedResult } from "@/lib/actions/search-scoped";
import { Icon } from "./Icon";
import type { Role } from "@/lib/types";

/**
 * Dashboard search for sellers and admins.
 *
 * Same ARIA combobox contract as the storefront SearchBox, with two
 * differences that matter:
 *
 *  - results are GROUPED by kind, so "Products" and "Users" are distinguishable
 *    to a screen reader as well as visually. Group headings are presentational
 *    rows inside the listbox, marked aria-hidden, with the group name repeated
 *    in each option's accessible name — headings inside a listbox are not
 *    announced reliably, so the option has to carry its own context.
 *  - the destination comes from the server with the result. The client never
 *    assembles a URL out of what the user typed.
 *
 * There is no submit target: a dashboard has no "all results" page, so Enter
 * activates the highlighted suggestion and nothing else.
 */

const PLACEHOLDER: Record<string, string> = {
  seller: "Search my products, order #…",
  admin: "Search users, products, tickets, order #…",
};

const ICON_FOR: Record<ScopedResult["kind"], string> = {
  product: "box",
  order: "truck",
  user: "users",
  ticket: "flag",
};

export function ScopedSearchBox({ variant }: { variant: Role }) {
  const router = useRouter();
  const listboxId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow request overwriting a newer one.
  const requestRef = useRef(0);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<ScopedResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();

    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const ticket = ++requestRef.current;
      const found = await suggestScoped(term);
      if (ticket !== requestRef.current) return; // a newer keystroke won
      setResults(found);
      setOpen(true);
      setActiveIndex(-1);
      setSearching(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  function go(result: ScopedResult) {
    setOpen(false);
    setQ("");
    router.push(result.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || !results.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  }

  // Render a heading row whenever the group changes.
  let lastGroup = "";

  return (
    <div className="search search--scoped" role="search">
      <label htmlFor="scoped-search" className="sr-only">
        {PLACEHOLDER[variant] ?? "Search"}
      </label>
      <div className="search__combobox">
        <input
          id="scoped-search"
          type="search"
          placeholder={PLACEHOLDER[variant] ?? "Search"}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(results.length > 0 || q.trim().length >= 2)}
          // Delayed so a click on a suggestion lands before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
        />

        {open ? (
          <ul className="search__suggestions" role="listbox" id={listboxId}>
            {results.length === 0 ? (
              <li className="search__empty" role="option" aria-selected={false} aria-disabled>
                {searching ? "Searching…" : `No matches for “${q.trim()}”`}
              </li>
            ) : (
              results.map((r, i) => {
                const showGroup = r.group !== lastGroup;
                lastGroup = r.group;
                return (
                  <li key={r.key} className="search__group-wrap">
                    {showGroup ? (
                      <span className="search__group" aria-hidden="true">
                        {r.group}
                      </span>
                    ) : null}
                    <span
                      id={`${listboxId}-opt-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      className={`search__suggestion${i === activeIndex ? " is-active" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        go(r);
                      }}
                      onMouseEnter={() => setActiveIndex(i)}
                    >
                      <Icon name={ICON_FOR[r.kind]} size={14} />
                      <span className="search__suggestion-text">
                        {/* The group is repeated into the accessible name
                            because a visual heading inside a listbox is not
                            announced with the option. */}
                        <span className="sr-only">{r.group}: </span>
                        {r.label}
                        {r.sublabel ? (
                          <small className="search__suggestion-meta"> {r.sublabel}</small>
                        ) : null}
                      </span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>

      {/* Status for assistive tech; the visual list conveys this already. */}
      <span className="sr-only" aria-live="polite">
        {open && results.length > 0
          ? `${results.length} suggestion${results.length === 1 ? "" : "s"} available.`
          : ""}
      </span>
    </div>
  );
}
