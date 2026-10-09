/**
 * Pricing core — the ONE place a price is computed.
 *
 * Pure: no I/O, no framework imports, no `server-only`. The server engine
 * (lib/pricing/engine.ts) loads the inputs and calls priceLines(); the
 * storefront and product page call the same helpers to DISPLAY a price, so the
 * price a buyer sees is, by construction, the price they are charged.
 *
 * Pipeline, in order:  base price → flash sale → PWD discount → caps →
 *                      shipping per seller group → totals.
 *
 * Before this module the cart priced every line at base_price while the
 * storefront showed the flash-sale price (B-02), and the server trusted a
 * caller-supplied variant without checking it belonged to the product (N-01).
 *
 * Tested by tests/pricing.test.mjs (node --test).
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Round to centavos. Money is never left as a long float. */
export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Price after a percentage discount, rounded to centavos. */
export function applyPercentOff(price: number, percent: number): number {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return roundMoney(Number(price) * (1 - pct / 100));
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PricingProduct {
  id: number;
  sellerId: number;
  title: string;
  basePrice: number;
  categoryId: string | null;
  /** True only when approved AND the seller's account is active. */
  isPublic: boolean;
  image: string | null;
}

export interface PricingVariant {
  id: number;
  productId: number;
  label: string;
  stock: number;
}

export interface PricingSale {
  id: number;
  productId: number;
  discountPercent: number;
}

/**
 * A PWD discount rule as the engine sees it (lib/pricing/engine.ts maps rows
 * from im_discount_rules). Only rules that are enabled AND apply to the
 * product reach priceLines().
 */
export interface PwdRule {
  id: number;
  type: "statutory_20" | "bnpc_5" | "voluntary";
  ratePercent: number;
  /** Statutory RA 10754: remove the 12% VAT before the 20% discount. */
  vatExempt: boolean;
  /**
   * Pesos of PURCHASES per buyer per ISO week that may earn this discount;
   * null = no cap. DTI-DA JMC 01-2022 caps the 5% BNPC discount at ₱1,300 of
   * purchases a week (so at most ₱65 of discount), not ₱1,300 of discount.
   */
  weeklyPurchaseCap: number | null;
  legalBasis: string;
  fundedBy: "seller" | "platform";
  categoryId: string | null;
  productId: number | null;
}

export interface PwdContext {
  /** Approved, unexpired verification id; null = buyer is not verified. */
  verificationId: number | null;
  rules: PwdRule[];
  /** Pesos of purchases that already earned each rule this ISO week. */
  weeklyUsed: Record<number, number>;
}

export interface LineInput {
  productId: number;
  variantId: number | null;
  quantity: number;
  cartItemId?: number;
}

export interface Catalog {
  products: Map<number, PricingProduct>;
  /** Every variant of every product in `products`. */
  variants: Map<number, PricingVariant>;
  /** Active sale per product id. */
  sales: Map<number, PricingSale>;
}

export interface PricingOptions {
  shippingPerSeller: number;
  maxQuantity?: number;
  pwd?: PwdContext | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type LineProblem = "unavailable" | "needs_option" | "sold_out" | "low_stock";

export interface PwdApplied {
  ruleId: number;
  type: PwdRule["type"];
  ratePercent: number;
  legalBasis: string;
  fundedBy: PwdRule["fundedBy"];
  verificationId: number;
  /** Purchase pesos on this line that earned the discount (for the cap). */
  eligibleAmount: number;
  /** Discount per unit, pesos. */
  unitDiscount: number;
  /** VAT removed per unit before the discount (statutory rule only). */
  unitVatExempt: number;
  /** True when the weekly cap reduced this line's discount. */
  capped: boolean;
}

export interface PricedLine {
  key: string;
  cartItemId?: number;
  productId: number;
  variantId: number | null;
  sellerId: number;
  title: string;
  variantLabel: string;
  image: string | null;
  quantity: number;
  /** Units in stock for the chosen variant (0 when unknown). */
  available: number;
  baseUnitPrice: number;
  sale: { id: number; percent: number } | null;
  /** Price after the flash sale, before any PWD discount. */
  saleUnitPrice: number;
  pwd: PwdApplied | null;
  /** What the buyer pays per unit. */
  unitPrice: number;
  lineTotal: number;
  problem: LineProblem | null;
  problemText: string | null;
}

export interface SellerGroup {
  sellerId: number;
  lines: PricedLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
}

export interface PricedCart {
  lines: PricedLine[];
  groups: SellerGroup[];
  itemCount: number;
  /** Sum of line totals that can be bought (problem lines excluded). */
  subtotal: number;
  /** Savings versus base price: flash sales. */
  saleSavings: number;
  /** Savings from PWD discounts. */
  pwdDiscountTotal: number;
  shippingTotal: number;
  grandTotal: number;
  /** True when every line can be bought as-is and there is at least one. */
  purchasable: boolean;
  /** First blocking problem, phrased for the buyer. */
  firstProblem: string | null;
}

// ---------------------------------------------------------------------------
// PWD discount
// ---------------------------------------------------------------------------

/** Pick the rule for a product: a product-specific rule beats a category one. */
export function pickPwdRule(rules: PwdRule[], product: PricingProduct): PwdRule | null {
  const byProduct = rules.find((r) => r.productId === product.id);
  if (byProduct) return byProduct;
  const byCategory = rules.find((r) => r.productId == null && r.categoryId != null && r.categoryId === product.categoryId);
  return byCategory ?? null;
}

/**
 * Per-unit PWD discount for a price, before caps.
 *
 * statutory_20 with vatExempt: RA 10754 grants the VAT exemption AND 20% off
 * the VAT-exclusive price, so the 12% VAT is removed first:
 *   net = price / 1.12;  discount = price − net × 0.80
 * Everything else is a straight percentage of the price.
 */
export function pwdUnitDiscount(price: number, rule: PwdRule): { discount: number; vatExempt: number } {
  if (rule.type === "statutory_20" && rule.vatExempt) {
    const net = roundMoney(price / 1.12);
    const vatExempt = roundMoney(price - net);
    const after = applyPercentOff(net, rule.ratePercent);
    return { discount: roundMoney(price - after), vatExempt };
  }
  return { discount: roundMoney(price - applyPercentOff(price, rule.ratePercent)), vatExempt: 0 };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

const DEFAULT_MAX_QTY = 99;

export function priceLines(inputs: LineInput[], catalog: Catalog, opts: PricingOptions): PricedCart {
  const maxQty = opts.maxQuantity ?? DEFAULT_MAX_QTY;
  const pwd = opts.pwd && opts.pwd.verificationId ? opts.pwd : null;
  // Cap consumption is tracked across the whole cart, per rule.
  const capUsed: Record<number, number> = { ...(pwd?.weeklyUsed ?? {}) };

  const lines: PricedLine[] = inputs.map((input, i) => {
    const product = catalog.products.get(input.productId);
    const quantity = Math.max(1, Math.min(maxQty, Math.floor(Number(input.quantity) || 1)));
    const key = input.cartItemId != null ? `c${input.cartItemId}` : `l${i}-${input.productId}-${input.variantId ?? 0}`;

    if (!product || !product.isPublic) {
      return blankLine(key, input, quantity, product, "unavailable", "This item is no longer available. Please remove it.");
    }

    const productVariants = [...catalog.variants.values()].filter((v) => v.productId === product.id);
    const variant = input.variantId != null ? catalog.variants.get(input.variantId) : undefined;
    // A variant id must belong to THIS product. Pairing a cheap product with
    // another product's expensive variant used to price at the cheap product
    // and decrement the expensive variant's stock (N-01).
    if (!variant || variant.productId !== product.id || !productVariants.length) {
      return blankLine(key, input, quantity, product, "needs_option", `Please choose an option for ${product.title}.`);
    }

    const baseUnitPrice = roundMoney(product.basePrice);
    const sale = catalog.sales.get(product.id) ?? null;
    const saleUnitPrice = sale ? applyPercentOff(baseUnitPrice, sale.discountPercent) : baseUnitPrice;

    let unitPrice = saleUnitPrice;
    let pwdApplied: PwdApplied | null = null;
    if (pwd) {
      const rule = pickPwdRule(pwd.rules, product);
      if (rule) {
        const full = pwdUnitDiscount(saleUnitPrice, rule);
        const lineAmount = roundMoney(saleUnitPrice * quantity);
        let unitDiscount = full.discount;
        let unitVatExempt = full.vatExempt;
        let eligibleAmount = lineAmount;
        let capped = false;
        if (rule.weeklyPurchaseCap != null) {
          const remaining = Math.max(0, roundMoney(rule.weeklyPurchaseCap - (capUsed[rule.id] ?? 0)));
          eligibleAmount = Math.min(lineAmount, remaining);
          if (eligibleAmount < lineAmount) {
            // Only part of this line fits under the weekly cap: discount that
            // part, spread over the units and rounded DOWN to the centavo so
            // the cap is never exceeded.
            capped = true;
            const share = lineAmount > 0 ? eligibleAmount / lineAmount : 0;
            unitDiscount = Math.floor(full.discount * share * 100) / 100;
            unitVatExempt = Math.floor(full.vatExempt * share * 100) / 100;
          }
          capUsed[rule.id] = roundMoney((capUsed[rule.id] ?? 0) + eligibleAmount);
        }
        if (unitDiscount > 0) {
          pwdApplied = {
            ruleId: rule.id,
            type: rule.type,
            ratePercent: rule.ratePercent,
            legalBasis: rule.legalBasis,
            fundedBy: rule.fundedBy,
            verificationId: pwd.verificationId as number,
            eligibleAmount,
            unitDiscount,
            unitVatExempt,
            capped,
          };
          unitPrice = roundMoney(saleUnitPrice - unitDiscount);
        }
      }
    }

    let problem: LineProblem | null = null;
    let problemText: string | null = null;
    if (variant.stock <= 0) {
      problem = "sold_out";
      problemText = `${product.title} (${variant.label}) just sold out. Please remove it.`;
    } else if (quantity > variant.stock) {
      problem = "low_stock";
      problemText = `Only ${variant.stock} left of ${product.title} (${variant.label}). Please lower the quantity.`;
    }

    return {
      key,
      cartItemId: input.cartItemId,
      productId: product.id,
      variantId: variant.id,
      sellerId: product.sellerId,
      title: product.title,
      variantLabel: variant.label,
      image: product.image,
      quantity,
      available: Math.max(0, variant.stock),
      baseUnitPrice,
      sale: sale ? { id: sale.id, percent: Number(sale.discountPercent) } : null,
      saleUnitPrice,
      pwd: pwdApplied,
      unitPrice,
      lineTotal: roundMoney(unitPrice * quantity),
      problem,
      problemText,
    };
  });

  // Group by seller, in first-seen order. Only lines without a blocking
  // problem count toward money; problem lines are still shown so the buyer
  // can fix or remove them.
  const order: number[] = [];
  const bySeller = new Map<number, PricedLine[]>();
  for (const line of lines) {
    if (!bySeller.has(line.sellerId)) {
      bySeller.set(line.sellerId, []);
      order.push(line.sellerId);
    }
    bySeller.get(line.sellerId)!.push(line);
  }

  const groups: SellerGroup[] = order.map((sellerId) => {
    const groupLines = bySeller.get(sellerId)!;
    const payable = groupLines.filter((l) => !l.problem);
    const subtotal = roundMoney(payable.reduce((n, l) => n + l.lineTotal, 0));
    const shippingFee = payable.length ? roundMoney(opts.shippingPerSeller) : 0;
    return { sellerId, lines: groupLines, subtotal, shippingFee, total: roundMoney(subtotal + shippingFee) };
  });

  const payable = lines.filter((l) => !l.problem);
  const subtotal = roundMoney(payable.reduce((n, l) => n + l.lineTotal, 0));
  const saleSavings = roundMoney(
    payable.reduce((n, l) => n + (l.baseUnitPrice - l.saleUnitPrice) * l.quantity, 0)
  );
  const pwdDiscountTotal = roundMoney(
    payable.reduce((n, l) => n + (l.pwd ? l.pwd.unitDiscount * l.quantity : 0), 0)
  );
  const shippingTotal = roundMoney(groups.reduce((n, g) => n + g.shippingFee, 0));
  const firstProblem = lines.find((l) => l.problem)?.problemText ?? null;

  return {
    lines,
    groups,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    saleSavings,
    pwdDiscountTotal,
    shippingTotal,
    grandTotal: roundMoney(subtotal + shippingTotal),
    purchasable: lines.length > 0 && !firstProblem,
    firstProblem,
  };
}

function blankLine(
  key: string,
  input: LineInput,
  quantity: number,
  product: PricingProduct | undefined,
  problem: LineProblem,
  problemText: string
): PricedLine {
  const base = product ? roundMoney(product.basePrice) : 0;
  return {
    key,
    cartItemId: input.cartItemId,
    productId: input.productId,
    variantId: input.variantId,
    sellerId: product?.sellerId ?? 0,
    title: product?.title ?? "Unavailable item",
    variantLabel: "",
    image: product?.image ?? null,
    quantity,
    available: 0,
    baseUnitPrice: base,
    sale: null,
    saleUnitPrice: base,
    pwd: null,
    unitPrice: base,
    lineTotal: roundMoney(base * quantity),
    problem,
    problemText,
  };
}

/** "Green · Small" — the label a buyer sees for a variant. */
export function variantLabel(colorName: string | null | undefined, size: string | null | undefined): string {
  return [colorName, size].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ") || "Standard";
}
