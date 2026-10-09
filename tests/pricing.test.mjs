import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPercentOff,
  priceLines,
  pwdUnitDiscount,
  roundMoney,
  variantLabel,
} from "../lib/pricing/core.ts";

const SHIP = 60;

function catalog({ products = [], variants = [], sales = [] }) {
  return {
    products: new Map(products.map((p) => [p.id, { isPublic: true, categoryId: null, image: null, ...p }])),
    variants: new Map(variants.map((v) => [v.id, v])),
    sales: new Map(sales.map((s) => [s.productId, s])),
  };
}

const bag = { id: 1, sellerId: 10, title: "Bag", basePrice: 899 };
const shirt = { id: 2, sellerId: 20, title: "Shirt", basePrice: 1150 };
const bagV = { id: 101, productId: 1, label: "Natural", stock: 5 };
const shirtV = { id: 201, productId: 2, label: "Blue · M", stock: 3 };

test("money rounds to centavos", () => {
  assert.equal(roundMoney(19.999), 20);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(applyPercentOff(899, 20), 719.2);
  assert.equal(applyPercentOff(100, 0), 100);
  assert.equal(applyPercentOff(100, 150), 0);
});

test("base price with one seller: subtotal plus one shipping fee", () => {
  const cart = priceLines(
    [{ productId: 1, variantId: 101, quantity: 2 }],
    catalog({ products: [bag], variants: [bagV] }),
    { shippingPerSeller: SHIP }
  );
  assert.equal(cart.subtotal, 1798);
  assert.equal(cart.shippingTotal, 60);
  assert.equal(cart.grandTotal, 1858);
  assert.equal(cart.purchasable, true);
});

test("flash sale price is the charged price (B-02)", () => {
  const cart = priceLines(
    [{ productId: 1, variantId: 101, quantity: 1 }],
    catalog({ products: [bag], variants: [bagV], sales: [{ id: 7, productId: 1, discountPercent: 20 }] }),
    { shippingPerSeller: SHIP }
  );
  const line = cart.lines[0];
  assert.equal(line.baseUnitPrice, 899);
  assert.equal(line.unitPrice, 719.2);
  assert.deepEqual(line.sale, { id: 7, percent: 20 });
  assert.equal(cart.saleSavings, 179.8);
  assert.equal(cart.grandTotal, roundMoney(719.2 + 60));
});

test("shipping is charged once per seller group", () => {
  const cart = priceLines(
    [
      { productId: 1, variantId: 101, quantity: 1 },
      { productId: 2, variantId: 201, quantity: 1 },
    ],
    catalog({ products: [bag, shirt], variants: [bagV, shirtV] }),
    { shippingPerSeller: SHIP }
  );
  assert.equal(cart.groups.length, 2);
  assert.equal(cart.shippingTotal, 120);
  assert.equal(cart.grandTotal, 899 + 1150 + 120);
});

test("a variant from another product is refused, never priced (N-01)", () => {
  const cart = priceLines(
    [{ productId: 1, variantId: 201, quantity: 1 }],
    catalog({ products: [bag, shirt], variants: [bagV, shirtV] }),
    { shippingPerSeller: SHIP }
  );
  assert.equal(cart.lines[0].problem, "needs_option");
  assert.equal(cart.purchasable, false);
  assert.equal(cart.grandTotal, 0);
});

test("missing variant, sold out and low stock block checkout", () => {
  const c = catalog({ products: [bag], variants: [{ ...bagV, stock: 0 }] });
  assert.equal(priceLines([{ productId: 1, variantId: null, quantity: 1 }], c, { shippingPerSeller: SHIP }).lines[0].problem, "needs_option");
  assert.equal(priceLines([{ productId: 1, variantId: 101, quantity: 1 }], c, { shippingPerSeller: SHIP }).lines[0].problem, "sold_out");
  const low = priceLines(
    [{ productId: 1, variantId: 101, quantity: 9 }],
    catalog({ products: [bag], variants: [bagV] }),
    { shippingPerSeller: SHIP }
  );
  assert.equal(low.lines[0].problem, "low_stock");
  assert.match(low.firstProblem, /Only 5 left/);
});

test("non-public products are unavailable and cost nothing", () => {
  const cart = priceLines(
    [{ productId: 1, variantId: 101, quantity: 1 }],
    catalog({ products: [{ ...bag, isPublic: false }], variants: [bagV] }),
    { shippingPerSeller: SHIP }
  );
  assert.equal(cart.lines[0].problem, "unavailable");
  assert.equal(cart.shippingTotal, 0);
});

test("quantity is clamped to 1..maxQuantity", () => {
  const big = { ...bagV, stock: 1000 };
  const cart = priceLines(
    [{ productId: 1, variantId: 101, quantity: 500 }],
    catalog({ products: [bag], variants: [big] }),
    { shippingPerSeller: SHIP }
  );
  assert.equal(cart.lines[0].quantity, 99);
  assert.equal(priceLines([{ productId: 1, variantId: 101, quantity: -3 }], catalog({ products: [bag], variants: [big] }), { shippingPerSeller: SHIP }).lines[0].quantity, 1);
});

// ---- PWD discount ---------------------------------------------------------

const voluntary = {
  id: 1, type: "voluntary", ratePercent: 10, vatExempt: false, weeklyPurchaseCap: null,
  legalBasis: "Seller PWD promo", fundedBy: "seller", categoryId: null, productId: 1,
};
const bnpc = {
  id: 2, type: "bnpc_5", ratePercent: 5, vatExempt: false, weeklyPurchaseCap: 1300,
  legalBasis: "DTI-DA JMC 01-2022", fundedBy: "seller", categoryId: "food", productId: null,
};
const statutory = {
  id: 3, type: "statutory_20", ratePercent: 20, vatExempt: true, weeklyPurchaseCap: null,
  legalBasis: "RA 10754", fundedBy: "seller", categoryId: null, productId: 1,
};

test("no PWD discount without an approved verification", () => {
  const cart = priceLines(
    [{ productId: 1, variantId: 101, quantity: 1 }],
    catalog({ products: [bag], variants: [bagV] }),
    { shippingPerSeller: SHIP, pwd: { verificationId: null, rules: [voluntary], weeklyUsed: {} } }
  );
  assert.equal(cart.lines[0].pwd, null);
  assert.equal(cart.pwdDiscountTotal, 0);
});

test("PWD discount applies after the flash sale", () => {
  const cart = priceLines(
    [{ productId: 1, variantId: 101, quantity: 1 }],
    catalog({ products: [bag], variants: [bagV], sales: [{ id: 7, productId: 1, discountPercent: 20 }] }),
    { shippingPerSeller: SHIP, pwd: { verificationId: 55, rules: [voluntary], weeklyUsed: {} } }
  );
  const line = cart.lines[0];
  assert.equal(line.saleUnitPrice, 719.2);
  assert.equal(line.pwd.unitDiscount, 71.92);
  assert.equal(line.unitPrice, 647.28);
  assert.equal(line.pwd.verificationId, 55);
  assert.equal(cart.pwdDiscountTotal, 71.92);
});

test("statutory 20% removes VAT first (RA 10754)", () => {
  const { discount, vatExempt } = pwdUnitDiscount(1120, statutory);
  assert.equal(vatExempt, 120); // 1120 / 1.12 = 1000
  assert.equal(discount, 320); // pays 1000 × 0.8 = 800
});

test("BNPC 5% stops at ₱1,300 of purchases a week, across orders", () => {
  const rice = { id: 3, sellerId: 30, title: "Rice", basePrice: 500, categoryId: "food" };
  const riceV = { id: 301, productId: 3, label: "5 kg", stock: 50 };
  const c = catalog({ products: [rice], variants: [riceV] });
  // 3 × 500 = 1500 of purchases; only 1300 may earn 5% → ₱65 total discount.
  const first = priceLines([{ productId: 3, variantId: 301, quantity: 3 }], c, {
    shippingPerSeller: SHIP,
    pwd: { verificationId: 9, rules: [bnpc], weeklyUsed: {} },
  });
  assert.equal(first.lines[0].pwd.capped, true);
  assert.equal(first.lines[0].pwd.eligibleAmount, 1300);
  assert.ok(first.pwdDiscountTotal <= 65);
  assert.ok(first.pwdDiscountTotal >= 64.98);
  // A second order the same week, with 1300 already used: no discount at all.
  const second = priceLines([{ productId: 3, variantId: 301, quantity: 1 }], c, {
    shippingPerSeller: SHIP,
    pwd: { verificationId: 9, rules: [bnpc], weeklyUsed: { 2: 1300 } },
  });
  assert.equal(second.lines[0].pwd, null);
  assert.equal(second.lines[0].unitPrice, 500);
});

test("variant labels read naturally", () => {
  assert.equal(variantLabel("Blue", "M"), "Blue · M");
  assert.equal(variantLabel("Natural", null), "Natural");
  assert.equal(variantLabel("", ""), "Standard");
});
