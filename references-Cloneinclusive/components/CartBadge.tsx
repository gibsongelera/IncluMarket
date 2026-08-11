"use client";

export function CartBadge({ count }: { count: number }) {
  return (
    <span className="badge badge--yellow" id="cart-count">
      {count}
    </span>
  );
}
