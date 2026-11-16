// lib/storefront-core.ts (P4-01): which categories get the "Best sellers in …"
// rails on /home (05 #8), and what the hero's side tile shows (05 #3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { heroPromo, topCategories } from "../lib/storefront-core.ts";

const cats = [
  { id: "bags", label: "Bags" },
  { id: "apparel", label: "Apparel" },
  { id: "crafts", label: "Crafts" },
  { id: "food", label: "Food" },
];

test("topCategories: the most live products first, two by default", () => {
  assert.deepEqual(topCategories({ bags: 3, apparel: 9, crafts: 5, food: 1 }, cats), ["apparel", "crafts"]);
  assert.deepEqual(topCategories({ bags: 3, apparel: 9, crafts: 5, food: 1 }, cats, 3), ["apparel", "crafts", "bags"]);
});

test("topCategories: a tie goes to the label, A→Z, whatever the case", () => {
  assert.deepEqual(topCategories({ bags: 4, apparel: 4, crafts: 4 }, cats), ["apparel", "bags"]);
  const mixed = [
    { id: "z", label: "zebra crafts" },
    { id: "b", label: "Bamboo" },
    { id: "a", label: "abaca" },
  ];
  assert.deepEqual(topCategories({ z: 2, b: 2, a: 2 }, mixed), ["a", "b"], "lower-case 'abaca' sorts before 'Bamboo'");
  // The order given does not matter, only counts and labels.
  assert.deepEqual(topCategories({ bags: 4, apparel: 4 }, [...cats].reverse()), ["apparel", "bags"]);
});

test("topCategories: categories with no live products are left out", () => {
  assert.deepEqual(topCategories({ bags: 0, apparel: 0, crafts: 2 }, cats), ["crafts"]);
  assert.deepEqual(topCategories({}, cats), []);
  // A count for a category that is not open (retired, unknown) cannot be picked.
  assert.deepEqual(topCategories({ retired: 50, food: 1 }, cats), ["food"]);
  // Inherited keys are not counts.
  assert.deepEqual(topCategories({}, [{ id: "constructor", label: "Odd" }]), []);
});

test("topCategories: fewer than two categories, or none asked for", () => {
  assert.deepEqual(topCategories({ bags: 3 }, [{ id: "bags", label: "Bags" }]), ["bags"]);
  assert.deepEqual(topCategories({ bags: 3 }, []), []);
  assert.deepEqual(topCategories({ bags: 3, apparel: 1 }, cats, 0), []);
});

const NOW = Date.parse("2026-11-17T08:00:00Z");
const sale = (id, endsAt) => ({
  id,
  sellerId: 10,
  sellerName: "Seller",
  title: `Item ${id}`,
  category: "bags",
  basePrice: 100,
  salePercent: 20,
  saleEndsAt: endsAt,
  effectivePrice: 80,
  ratingAvg: 0,
  ratingCount: 0,
  soldCount: 0,
  stockTotal: 5,
  isFeatured: false,
  adaptiveTags: [],
  image: null,
  createdAt: "2026-01-01T00:00:00Z",
  sellerVerified: false,
});
const shop = { id: 7, name: "Weaves of Zamboanga", story: null, logo: null, verified: true, productCount: 4 };

test("heroPromo: the live flash sale comes first, with its end time", () => {
  const onSale = [sale(1, "2026-11-17T10:00:00Z"), sale(2, "2026-11-18T10:00:00Z")];
  const p = heroPromo(onSale, [shop], NOW);
  assert.equal(p?.kind, "flash");
  assert.equal(p.item.id, 1);
  assert.equal(p.endsAt, "2026-11-17T10:00:00Z");
});

test("heroPromo: a sale that has ended (or has no end) is skipped", () => {
  const onSale = [sale(1, "2026-11-17T07:59:59Z"), sale(3, null), sale(2, "2026-11-17T09:00:00Z")];
  const p = heroPromo(onSale, [shop], NOW);
  assert.equal(p?.kind, "flash");
  assert.equal(p.item.id, 2);
  assert.equal(heroPromo([sale(1, "2026-11-17T08:00:00Z")], [], NOW), null, "ending this very moment is over");
});

test("heroPromo: no live sale → the first featured shop", () => {
  const other = { ...shop, id: 8 };
  assert.deepEqual(heroPromo([], [shop, other], NOW), { kind: "shop", shop });
  assert.deepEqual(heroPromo([sale(1, "2026-11-16T00:00:00Z")], [shop], NOW), { kind: "shop", shop });
});

test("heroPromo: neither → null, and the page hides the tile", () => {
  assert.equal(heroPromo([], [], NOW), null);
  assert.equal(heroPromo([sale(1, "not a date")], [], NOW), null);
});
