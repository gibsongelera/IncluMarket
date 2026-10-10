import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterAndSort,
  levenshtein,
  matchScore,
  parseStorefrontParams,
  storefrontParams,
} from "../lib/storefront-core.ts";

const item = (over) => ({
  id: 1,
  sellerId: 10,
  sellerName: "Seller",
  title: "Thing",
  description: "",
  category: "bags",
  basePrice: 100,
  salePercent: null,
  saleEndsAt: null,
  effectivePrice: 100,
  ratingAvg: 0,
  ratingCount: 0,
  soldCount: 0,
  stockTotal: 5,
  isFeatured: false,
  adaptiveTags: [],
  image: null,
  createdAt: "2026-01-01T00:00:00Z",
  sellerVerified: false,
  ...over,
});

const catalog = [
  item({ id: 1, title: "Bayong bag", category: "bags", effectivePrice: 899, soldCount: 4, createdAt: "2026-03-01T00:00:00Z" }),
  item({ id: 2, title: "Abaca shirt", category: "apparel", effectivePrice: 1150, soldCount: 9, createdAt: "2026-02-01T00:00:00Z", sellerVerified: true, adaptiveTags: ["easy_closure"] }),
  item({ id: 3, title: "Woven placemat", description: "Hand-woven bayong pattern", category: "crafts", effectivePrice: 250, basePrice: 300, salePercent: 16.67, ratingAvg: 4.5, createdAt: "2026-04-01T00:00:00Z" }),
];

test("“bayong” finds the bag first, then the placemat that mentions it", () => {
  const r = filterAndSort(catalog, { q: "bayong", sort: "relevance" });
  assert.deepEqual(r.map((i) => i.id), [1, 3]);
});

test("a typo still finds it: “bayng” → Bayong bag", () => {
  assert.ok(matchScore("bayng", "Bayong bag") > 0);
  assert.deepEqual(filterAndSort(catalog, { q: "bayng" }).map((i) => i.id)[0], 1);
  assert.equal(matchScore("zzzz", "Bayong bag"), 0);
});

test("levenshtein stops early past its cap", () => {
  assert.equal(levenshtein("bayng", "bayong"), 1);
  assert.equal(levenshtein("tabel", "table"), 1, "a swapped pair is one typo");
  assert.ok(matchScore("tabel runer", "Foot-Loom Table Runner") > 0);
  assert.ok(levenshtein("completely", "different", 2) > 2);
});

test("sorting uses the price the buyer pays", () => {
  assert.deepEqual(filterAndSort(catalog, { sort: "price_asc" }).map((i) => i.id), [3, 1, 2]);
  assert.deepEqual(filterAndSort(catalog, { sort: "price_desc" }).map((i) => i.id), [2, 1, 3]);
  assert.deepEqual(filterAndSort(catalog, { sort: "top_sales" }).map((i) => i.id), [2, 1, 3]);
  assert.deepEqual(filterAndSort(catalog, { sort: "latest" }).map((i) => i.id), [3, 1, 2]);
});

test("filters combine: category, price, rating, tags, verified", () => {
  assert.deepEqual(filterAndSort(catalog, { category: "bags" }).map((i) => i.id), [1]);
  assert.deepEqual(filterAndSort(catalog, { min: 200, max: 900 }).map((i) => i.id).sort(), [1, 3]);
  assert.deepEqual(filterAndSort(catalog, { rating: 4 }).map((i) => i.id), [3]);
  assert.deepEqual(filterAndSort(catalog, { tags: ["easy_closure"] }).map((i) => i.id), [2]);
  assert.deepEqual(filterAndSort(catalog, { verified: true }).map((i) => i.id), [2]);
});

test("descriptions never leave the server in results", () => {
  for (const r of filterAndSort(catalog, { q: "bayong" })) assert.equal("description" in r, false);
});

test("URL params are parsed defensively and round-trip", () => {
  const q = parseStorefrontParams({ q: " bag ", cat: "bags", min: "100", max: "-5", rating: "9", tags: "easy_grip,evil", sort: "drop table", page: "999", verified: "1" });
  assert.equal(q.q, "bag");
  assert.equal(q.min, 100);
  assert.equal(q.max, undefined, "negative max ignored");
  assert.equal(q.rating, undefined, "rating outside 1–5 ignored");
  assert.deepEqual(q.tags, ["easy_grip"]);
  assert.equal(q.sort, "relevance", "unknown sort falls back; relevance when searching");
  assert.equal(q.page, 10, "page is capped");
  assert.equal(q.verified, true);
  assert.equal(parseStorefrontParams({}).sort, "latest");
  const p = storefrontParams(q, { page: 2 });
  assert.equal(p.get("page"), "2");
  assert.equal(p.get("sort"), null, "the default sort is left out of the URL");
  assert.equal(p.get("tags"), "easy_grip");
});
