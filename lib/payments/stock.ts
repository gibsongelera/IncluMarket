import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { rateLimit } from "@/lib/security/rate-limit";
import { OTC_HOLD_HOURS, PAYMENT_HOLD_MINUTES } from "@/lib/pricing/constants";
import { getSettingInts } from "@/lib/settings";
import { transitionOrder } from "@/lib/orders/transition";

/**
 * Stock held by unpaid online orders.
 *
 * placeOrder reserves stock BEFORE the buyer pays, so that two buyers cannot
 * pay for the same last unit. Until this module, nothing ever gave that stock
 * back: the PayMongo cancel URL was ignored, `payment.failed` left it held,
 * and abandoned sessions never expired (B-06). Every release goes through
 * failPendingPayment(), whose conditional UPDATE makes it happen exactly once
 * however many times the cancel page, the webhook and the sweep race.
 *
 * Plain server-only module — none of this is callable from the browser.
 */

type Db = ReturnType<typeof createAdminClient>;

interface Line {
  variantId: number;
  qty: number;
  title: string;
}

async function orderLines(db: Db, orderId: number): Promise<Line[]> {
  const { data: items } = await db
    .from("im_order_items")
    .select("variant_id, quantity, product_id")
    .eq("order_id", orderId);
  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as number[];
  const { data: products } = productIds.length
    ? await db.from("im_products").select("id, title").in("id", productIds)
    : { data: [] as { id: number; title: string }[] };
  const titleById = new Map((products ?? []).map((p) => [p.id, p.title as string]));
  return (items ?? [])
    .filter((i) => i.variant_id != null)
    .map((i) => ({
      variantId: i.variant_id as number,
      qty: Number(i.quantity),
      title: titleById.get(i.product_id as number) ?? "an item",
    }));
}

/** Give back every unit an order holds. Call only after a status gate. */
export async function releaseOrderStock(db: Db, orderId: number): Promise<void> {
  for (const line of await orderLines(db, orderId)) {
    await db.rpc("im_restore_variant_stock", { p_variant_id: line.variantId, p_qty: line.qty });
  }
}

/**
 * Take the stock for an order again (paying for an order whose hold had been
 * released). All or nothing: a line that no longer fits unwinds the others.
 */
export async function reserveOrderStock(
  db: Db,
  orderId: number
): Promise<{ ok: true } | { ok: false; title: string }> {
  const lines = await orderLines(db, orderId);
  const taken: Line[] = [];
  for (const line of lines) {
    const { data: ok } = await db.rpc("im_decrement_variant_stock", {
      p_variant_id: line.variantId,
      p_qty: line.qty,
    });
    if (ok !== true) {
      for (const t of taken) {
        await db.rpc("im_restore_variant_stock", { p_variant_id: t.variantId, p_qty: t.qty });
      }
      return { ok: false, title: line.title };
    }
    taken.push(line);
  }
  return { ok: true };
}

/**
 * Mark a PENDING online payment failed and release its stock — exactly once.
 *
 * The `.eq("payment_status", "pending")` turns the check and the change into
 * one statement: when the cancel page, the webhook and the expiry sweep all
 * fire for the same order, only the first gets a row back and releases stock.
 * Returns whether this call was the one that did it.
 */
export async function failPendingPayment(db: Db, orderId: number, note: string): Promise<boolean> {
  const { data } = await db
    .from("im_orders")
    .update({ payment_status: "failed" })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();
  if (!data) return false;

  await releaseOrderStock(db, orderId);
  await db.from("im_order_status_history").insert({ order_id: orderId, status: "pending", note });
  return true;
}

/** When the latest step of an order was recorded, in ms (0 when none). */
async function lastActivityMs(db: Db, orderId: number): Promise<number> {
  const { data: last } = await db
    .from("im_order_status_history")
    .select("created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Compare as instants: Postgres returns "+00:00", toISOString() gives "Z".
  return last ? new Date(last.created_at).getTime() : 0;
}

/**
 * Release stock held by online orders left unpaid for the hold an admin set
 * (payment_hold_minutes, default PAYMENT_HOLD_MINUTES), and cancel counter
 * orders the Workshop was not paid for in time (otc_hold_hours).
 *
 * There is no scheduler on this deployment, so this runs opportunistically
 * from pages that care (My Orders, checkout, admin) and is throttled through
 * im_rate_limits to at most once every five minutes across all instances.
 * An order whose payment was restarted recently (a fresh history row) is left
 * alone even if it was created long ago.
 */
export async function expireStalePayments(): Promise<number> {
  const gate = await rateLimit("sweep_stale_payments", "global", { limit: 1, windowSeconds: 300 });
  if (!gate.ok) return 0;

  const db = createAdminClient();
  const hold = await getSettingInts({ payment_hold_minutes: PAYMENT_HOLD_MINUTES, otc_hold_hours: OTC_HOLD_HOURS });
  const holdMinutes = hold.payment_hold_minutes;
  const cutoffMs = Date.now() - holdMinutes * 60_000;
  const cutoff = new Date(cutoffMs).toISOString();
  const { data: stale } = await db
    .from("im_orders")
    .select("id, buyer_id")
    .eq("payment_provider", "paymongo")
    .eq("payment_status", "pending")
    .lt("created_at", cutoff)
    .limit(50);

  let released = 0;
  for (const order of stale ?? []) {
    if ((await lastActivityMs(db, order.id)) > cutoffMs) continue;

    const did = await failPendingPayment(
      db,
      order.id,
      `Payment not completed within ${holdMinutes} minutes. Items released back to stock.`
    );
    if (!did) continue;
    released++;
    await createNotification({
      userId: order.buyer_id,
      type: "order_status",
      title: `Payment for order #${order.id} timed out`,
      body: "No money was taken. You can pay again from My Orders while the items are still in stock.",
      link: "/buyer/orders",
    });
  }

  // An order whose payment failed stays in "To pay" for a day so the buyer
  // can try again; after that it is cancelled so it stops cluttering the list
  // and the seller's queue. Its stock was released when the payment failed.
  const dayAgoMs = Date.now() - 24 * 60 * 60_000;
  const { data: failed } = await db
    .from("im_orders")
    .select("id")
    .eq("payment_provider", "paymongo")
    .eq("payment_status", "failed")
    .eq("order_status", "pending")
    .lt("created_at", new Date(dayAgoMs).toISOString())
    .limit(50);
  for (const order of failed ?? []) {
    if ((await lastActivityMs(db, order.id)) > dayAgoMs) continue;
    await transitionOrder(db, {
      orderId: order.id,
      to: "cancelled",
      actorId: null,
      actorRole: "system",
      meta: { reason: "Payment was not completed." },
    });
  }
  return released + (await expireCounterHolds(db, hold.otc_hold_hours));
}

/**
 * Cancel counter orders (migration 0028) that the Workshop was not paid for
 * within the hold, and put their items back on sale. A reference the buyer
 * sent that an admin has not checked yet keeps the hold, and so does any
 * recent step (sending a reference, or an admin refusing one, writes a
 * history row). There is no "try again" stage as for online payments: the
 * buyer pays by sending money, not by opening a page, so once the hold is
 * over the order is cancelled. A payment that still arrives is confirmed by
 * an admin as usual, and flags the cancelled orders for a refund.
 */
async function expireCounterHolds(db: Db, holdHours: number): Promise<number> {
  const cutoffMs = Date.now() - holdHours * 3_600_000;
  const { data: stale, error } = await db
    .from("im_orders")
    .select("id, buyer_id, seller_id, checkout_id")
    .eq("payment_provider", "otc")
    .eq("payment_status", "pending")
    .eq("order_status", "pending")
    .lt("created_at", new Date(cutoffMs).toISOString())
    .limit(50);
  if (error || !stale?.length) return 0;

  const checkoutIds = [...new Set(stale.map((o) => o.checkout_id).filter((n): n is number => n != null))];
  const { data: open, error: openErr } = checkoutIds.length
    ? await db.from("im_payment_proofs").select("checkout_id").eq("status", "submitted").in("checkout_id", checkoutIds)
    : { data: [] as { checkout_id: number }[], error: null };
  if (openErr) return 0;
  const waiting = new Set((open ?? []).map((p) => Number(p.checkout_id)));

  let released = 0;
  const toldBuyer = new Set<number>();
  for (const order of stale) {
    if (order.checkout_id != null && waiting.has(Number(order.checkout_id))) continue;
    if ((await lastActivityMs(db, order.id)) > cutoffMs) continue;

    const did = await failPendingPayment(
      db,
      order.id,
      `No payment to the Workshop arrived within ${holdHours} hours. Items released back to stock.`
    );
    if (!did) continue;
    released++;
    await transitionOrder(db, {
      orderId: order.id,
      to: "cancelled",
      actorId: null,
      actorRole: "system",
      meta: { reason: `The payment to the Workshop did not arrive within ${holdHours} hours.` },
    });
    if (order.seller_id != null) {
      await createNotification({
        userId: order.seller_id,
        type: "order_status",
        title: `Order #${order.id} was cancelled`,
        body: "The buyer did not pay the Workshop in time, so there is nothing to prepare. Its items are back on sale.",
        link: "/seller/orders",
      });
    }
    const key = Number(order.checkout_id ?? -order.id);
    if (toldBuyer.has(key)) continue;
    toldBuyer.add(key);
    await createNotification({
      userId: order.buyer_id,
      type: "order_status",
      title: `Order #${order.id} was cancelled`,
      body: "We did not receive your payment to the Workshop in time, and the items are back on sale. If you did pay, send the reference number and we will refund you.",
      link: order.checkout_id != null ? `/buyer/pay/${order.checkout_id}` : "/buyer/orders",
    });
  }
  return released;
}
