import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { CounterPayForm } from "@/components/CounterPayForm";
import { Pill } from "@/components/Pill";
import type { CounterAccount, CounterCheckout } from "@/lib/counter-payments";
import { COUNTER_CHANNELS } from "@/lib/counter-channels";
import { formatDateTime, money } from "@/lib/format";
import { SITE } from "@/lib/site";

/**
 * The body of Pay the Workshop (/buyer/pay/[checkout], migration 0028): what
 * to send and where, the form for the reference number, and the orders it
 * pays for. The page reads the data and checks that the checkout is the
 * viewer's; this only renders it.
 */
export function PayWorkshopView({ checkout, accounts }: { checkout: CounterCheckout; accounts: CounterAccount[] }) {
  const open = checkout.proofs.find((p) => p.status === "submitted") ?? null;
  const approved = checkout.proofs.find((p) => p.status === "approved") ?? null;
  const lastRefused = !open && checkout.proofs[0]?.status === "rejected" ? checkout.proofs[0] : null;
  const paid = checkout.paymentStatus === "paid" || approved !== null;
  const channels = COUNTER_CHANNELS.filter((c) => accounts.some((a) => a.channel === c.id)).map((c) => ({ id: c.id, label: c.label }));
  const orderWord = checkout.orders.length === 1 ? "order" : "orders";

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/buyer/orders">My orders</Link> <span aria-hidden="true">/</span> Pay the Workshop
      </nav>
      <h1>Pay the Workshop</h1>
      <p className="lede">
        {SITE.workshop.name}, under {SITE.workshop.under}. The Workshop receives the payment and pays the PWD
        sellers.
      </p>

      {paid ? (
        <p className="notice notice--success" role="status">
          <strong>Paid. Thank you!</strong>{" "}
          {approved?.reviewedAt ? `The Workshop confirmed your payment on ${formatDateTime(approved.reviewedAt)}.` : "The Workshop confirmed your payment."}{" "}
          {checkout.cancelled
            ? "Your order had already been cancelled, so the Workshop will refund you."
            : "The seller is now preparing your order."}{" "}
          <Link href="/buyer/orders">See my orders</Link>
        </p>
      ) : open ? (
        <p className="notice notice--info" role="status">
          <strong>We are checking your payment.</strong> {open.channelLabel} reference{" "}
          <span className="mono">{open.reference}</span>, {money(open.amount)}, sent {formatDateTime(open.createdAt)}. We
          will tell you here and by email as soon as the Workshop confirms it. Your items stay reserved meanwhile.
        </p>
      ) : checkout.cancelled ? (
        <p className="notice notice--warning">
          <strong>This checkout was cancelled.</strong> Its items are back on sale, so please do not send a payment for it
          now. If you already paid before it was cancelled, send the payment details below and the Workshop will refund
          you.
        </p>
      ) : null}

      {lastRefused && !paid ? (
        <p className="notice notice--warning">
          <strong>We could not confirm your last payment details</strong> ({lastRefused.channelLabel},{" "}
          <span className="mono">{lastRefused.reference}</span>): {lastRefused.reviewNote || "the Workshop did not find it."}{" "}
          Check your receipt and send them again.
        </p>
      ) : null}

      <div className="pay-layout">
        <div className="pay-layout__main">
          {!paid && !checkout.cancelled ? (
            <section className="card" aria-labelledby="pay-due-title">
              <h2 id="pay-due-title">Amount to send</h2>
              <p className="pay-due__amount">{money(checkout.grandTotal)}</p>
              <p>
                Please pay by <strong>{formatDateTime(checkout.payBy)}</strong>. We keep your items for{" "}
                {checkout.holdHours} hours; after that the {orderWord} {checkout.orders.length === 1 ? "is" : "are"}{" "}
                cancelled and the items go back on sale.
              </p>
              <ol className="pay-steps">
                <li>Send exactly {money(checkout.grandTotal)} to one of the Workshop&rsquo;s accounts below, in your app or at a counter or branch.</li>
                <li>Keep the receipt. Its reference number is how the Workshop finds your payment.</li>
                <li>Enter the reference number below. A photo of the receipt helps, but you can leave it out.</li>
                <li>When the Workshop confirms the payment, the seller starts preparing your {orderWord}.</li>
              </ol>
            </section>
          ) : null}

          {!paid && !checkout.cancelled ? (
            <section className="card" aria-labelledby="pay-accounts-title">
              <h2 id="pay-accounts-title">The Workshop&rsquo;s accounts</h2>
              {accounts.length ? (
                <ul className="pay-accounts" role="list">
                  {accounts.map((a) => (
                    <li key={a.channel} className="pay-account">
                      <span className="pay-account__channel">{a.label}</span>
                      <span className="pay-account__name">{a.accountName}</span>
                      <span className="pay-account__number">
                        <span className="mono">{a.accountNumber}</span>
                        <CopyButton text={a.accountNumber.replace(/\s+/g, "")} label={`${a.label} account number`} />
                      </span>
                      {a.instructions ? <span className="muted small">{a.instructions}</span> : null}
                      <span className="muted small">{COUNTER_CHANNELS.find((c) => c.id === a.channel)?.hint}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">
                  <p>
                    <strong>The Workshop&rsquo;s accounts are not shown right now.</strong> Please{" "}
                    <Link href="/contact">contact us</Link> before you send any money, and we will tell you where to
                    pay.
                  </p>
                </div>
              )}
            </section>
          ) : null}
        </div>

        <div className="pay-layout__side">
          {!paid && !open && channels.length ? (
            <section className="card" aria-labelledby="pay-proof-title">
              <h2 id="pay-proof-title">{checkout.cancelled ? "Already paid?" : "I have paid"}</h2>
              <CounterPayForm
                checkoutId={checkout.id}
                channels={channels}
                amountDue={checkout.grandTotal}
                submitLabel={checkout.cancelled ? "Send payment details for a refund" : "Send payment details"}
              />
            </section>
          ) : null}

          <section className="card" aria-labelledby="pay-orders-title">
            <h2 id="pay-orders-title">
              {checkout.orders.length === 1 ? "Your order" : `Your ${checkout.orders.length} orders`}
            </h2>
            <p className="muted small">
              One payment covers every shop in this checkout. Each shop sends its own parcel.
            </p>
            <ul className="pay-orders" role="list">
              {checkout.orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/buyer/orders/${o.id}`}>Order #{o.id}</Link>
                  <span className="muted"> · {o.sellerName}</span>
                  <span className="pay-orders__meta">
                    <Pill status={o.orderStatus} /> <span className="price">{money(o.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
