"use client";

import { useEffect, useState } from "react";
import { count } from "@/lib/cart";

export function CartBadge({ userId }: { userId: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const update = () => setN(count(userId));
    update();
    window.addEventListener("im:cart", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("im:cart", update);
      window.removeEventListener("storage", update);
    };
  }, [userId]);

  return (
    <span className="badge badge--yellow" id="cart-count">
      {n}
    </span>
  );
}
