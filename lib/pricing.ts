/**
 * Pricing constants shared by the server and the checkout UI.
 *
 * This deliberately does NOT live in lib/actions/shop.ts: a "use server"
 * module may only export async functions, so a `const` there is a build error.
 * It is also not `server-only`, because the checkout page needs to display the
 * same figure it is charged.
 *
 * The server recomputes the order total from this value — the client only ever
 * renders it, and never supplies a total.
 */

/** Flat shipping fee in pesos. */
export const SHIPPING_FEE = 60;
