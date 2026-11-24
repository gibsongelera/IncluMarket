/**
 * Pricing constants shared by the server and the UI.
 *
 * Not `server-only`: pages display the same figures the server charges. The
 * server always recomputes totals through lib/pricing/engine.ts — a client
 * only ever renders numbers, never supplies one.
 */

/**
 * Shipping fee in pesos, charged once per SELLER in a checkout.
 *
 * Client default (open question Q6): ₱60 per seller group, because each
 * seller ships their own parcel. It used to be ₱60 per order regardless of how
 * many sellers' parcels it produced.
 */
export const SHIPPING_FEE = 60;

/** Largest quantity of one variant a buyer can put in a cart line. */
export const MAX_LINE_QUANTITY = 99;

/**
 * Minutes an online payment may stay unpaid before its stock is released, unless
 * Admin → Settings says otherwise (payment_hold_minutes).
 */
export const PAYMENT_HOLD_MINUTES = 60;

/**
 * Hours an order paid to the Workshop over the counter (migration 0028) keeps
 * its items before it is cancelled, unless Admin → Settings says otherwise
 * (otc_hold_hours).
 */
export const OTC_HOLD_HOURS = 48;
