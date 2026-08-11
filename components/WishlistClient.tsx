"use client";

import { useMemo } from "react";
import type { Category, Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";

export function WishlistClient({
  products,
  categories,
  stock,
  ratingAvg,
  ratingCount,
}: {
  products: Product[];
  categories: Category[];
  stock: Record<number, number>;
  ratingAvg: Record<number, number>;
  ratingCount: Record<number, number>;
}) {
  const catLabel = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => (map[c.id] = c.folder || c.label));
    return map;
  }, [categories]);

  if (!products.length) {
    return (
      <p className="empty">
        Nothing saved yet. Tap the heart on any product to add it to your wishlist.
      </p>
    );
  }

  return (
    <div className="product-grid" aria-live="polite">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          stock={stock[p.id] || 0}
          rating={ratingAvg[p.id] || 0}
          ratingCount={ratingCount[p.id] || 0}
          categoryLabel={catLabel[p.category || ""] || p.category || "Uncategorized"}
          wishlisted
        />
      ))}
    </div>
  );
}
