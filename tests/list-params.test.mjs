// lib/list-params.ts (ADR-05, 03 §6): an admin list's page, page size,
// search text and filters from the URL, and back into links. The search
// text ends up inside PostgREST's or(), so hostile strings are tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_MAX,
  cleanSearch,
  listHref,
  pageCount,
  pageItems,
  pageOf,
  pageRange,
  parseListParams,
  searchId,
  searchPattern,
} from "../lib/list-params.ts";

/** Whether a LIKE pattern's inside has a % or _ that is not escaped. */
function hasBareWildcard(inner) {
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\") i++;
    else if (inner[i] === "%" || inner[i] === "_") return true;
  }
  return false;
}

test("page and page size: whole numbers, page at least 1, size 10, 25 or 50", () => {
  const p = (raw) => parseListParams(raw);
  assert.equal(p({}).page, 1);
  assert.equal(p({ page: "3" }).page, 3);
  assert.equal(p({ page: ["4", "9"] }).page, 4);
  for (const bad of ["0", "-2", "1e3", "3.5", "0x10", "abc", " ", "99999999999999999999"]) {
    assert.equal(p({ page: bad }).page, 1, bad);
  }
  assert.equal(p({ page: "123456" }).page, 10000);
  assert.equal(p({}).perPage, 25);
  assert.equal(p({ per: "50" }).perPage, 50);
  assert.equal(p({ per: "10" }).perPage, 10);
  for (const bad of ["7", "100", "25x", "-10", ""]) assert.equal(p({ per: bad }).perPage, 25, bad);
});

test("filters and focus: only the kept names, focus only as an id", () => {
  const p = parseListParams({ view: "returns", role: "seller", evil: "x", status: "y".repeat(41) });
  assert.deepEqual(p.filters, { view: "returns", role: "seller" });
  assert.equal(parseListParams({ focus: "42" }).focus, 42);
  for (const bad of ["0", "-1", "4.2", "1e2", "42abc", ""]) assert.equal(parseListParams({ focus: bad }).focus, null, bad);
});

test("search text: tidied, capped at 80 characters, never split inside a character", () => {
  assert.equal(cleanSearch("  Maria   Santos \n"), "Maria Santos");
  assert.equal(cleanSearch("a\u0000b\u001fc\u007f"), "a b c");
  assert.equal(cleanSearch("x".repeat(200)).length, SEARCH_MAX);
  assert.equal(Array.from(cleanSearch("😀".repeat(100))).length, SEARCH_MAX);
  assert.equal(parseListParams({ q: "  shoes  " }).q, "shoes");
});

test("searchPattern: or() grammar removed, LIKE wildcards escaped, nothing left is null", () => {
  assert.equal(searchPattern("banig"), "%banig%");
  assert.equal(searchPattern("50%_off"), "%50\\%\\_off%");
  assert.equal(searchPattern("a\\b"), "%a\\\\b%");
  assert.equal(searchPattern("   "), null);
  // Each would add a condition to or(), close its group, quote a value or match every row.
  for (const hostile of [
    "x,email.ilike.*",
    "x),or(role.eq.admin",
    'x".ilike."%',
    "name.ilike.%25",
    "*",
    "%",
    "_",
    "(,)",
    "\\",
    "a\u0000,b",
  ]) {
    const pat = searchPattern(hostile);
    if (pat === null) continue;
    assert.ok(pat.startsWith("%") && pat.endsWith("%"), `${hostile} -> ${pat}`);
    const inner = pat.slice(1, -1);
    assert.ok(!/[,()"*]/.test(inner), `${hostile} -> ${pat}`);
    assert.ok(!hasBareWildcard(inner), `${hostile} -> ${pat}`);
    assert.ok(inner.length > 0, `${hostile} -> ${pat}`);
  }
  assert.equal(searchPattern("*"), null);
  assert.equal(searchPattern("(,)"), null);
});

test("searchId: an order number with or without #", () => {
  assert.equal(searchId("123"), 123);
  assert.equal(searchId(" #123 "), 123);
  for (const bad of ["12a", "0", "1e3", "#", "-5", "Maria"]) assert.equal(searchId(bad), null, bad);
});

test("pages: range, count and the page that holds a row", () => {
  assert.deepEqual(pageRange(1, 25), { from: 0, to: 24 });
  assert.deepEqual(pageRange(3, 10), { from: 20, to: 29 });
  assert.deepEqual(pageRange(0, 10), { from: 0, to: 9 });
  assert.equal(pageCount(0, 25), 1);
  assert.equal(pageCount(25, 25), 1);
  assert.equal(pageCount(26, 25), 2);
  assert.equal(pageOf(0, 25), 1);
  assert.equal(pageOf(24, 25), 1);
  assert.equal(pageOf(25, 25), 2);
});

test("pageItems: first, last, the current page and its neighbours, gaps of two or more", () => {
  const show = (current, pages) => pageItems(current, pages).map((p) => p ?? "…").join(" ");
  assert.equal(show(5, 20), "1 … 4 5 6 … 20");
  assert.equal(show(1, 20), "1 2 … 20");
  assert.equal(show(3, 20), "1 2 3 4 … 20");
  // A gap would hide only page 2, so 2 is shown.
  assert.equal(show(4, 20), "1 2 3 4 5 … 20");
  assert.equal(show(20, 20), "1 … 19 20");
  assert.equal(show(1, 1), "1");
  assert.equal(show(2, 3), "1 2 3");
  assert.equal(show(1, 5), "1 2 … 5");
  // Out of range or fractional input is clamped, never an empty or a wider row.
  assert.equal(show(99, 4), "1 2 3 4");
  assert.equal(show(0, 0), "1");
  assert.equal(show(2.7, 9), "1 2 3 … 9");
  for (let pages = 1; pages <= 40; pages++) {
    for (let current = 1; current <= pages; current++) {
      const items = pageItems(current, pages);
      assert.ok(items.length <= 7, `${current}/${pages}`);
      assert.ok(items.includes(current) && items[0] === 1 && items.at(-1) === pages, `${current}/${pages}`);
      const nums = items.filter((p) => p !== null);
      assert.deepEqual(nums, [...nums].sort((a, b) => a - b), `${current}/${pages}`);
    }
  }
});

test("listHref keeps filters and search, drops defaults, and a new search starts at page 1", () => {
  const params = parseListParams({ view: "returns", q: "maria", per: "50", page: "3" });
  assert.equal(listHref("/admin/orders", params), "/admin/orders?view=returns&q=maria&per=50&page=3");
  assert.equal(listHref("/admin/orders", params, { page: 4 }), "/admin/orders?view=returns&q=maria&per=50&page=4");
  assert.equal(listHref("/admin/orders", params, { q: "juan" }), "/admin/orders?view=returns&q=juan&per=50");
  assert.equal(listHref("/admin/orders", params, { perPage: 25 }), "/admin/orders?view=returns&q=maria");
  assert.equal(listHref("/admin/orders", params, { view: null }), "/admin/orders?q=maria&per=50");
  assert.equal(listHref("/admin/orders", parseListParams({})), "/admin/orders");
  assert.equal(listHref("/admin/users", parseListParams({ q: "a&b=c d" })), "/admin/users?q=a%26b%3Dc+d");
});
