"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, maskEmail, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { Icon } from "./Icon";
import { setProductStatus, setProductFeatured } from "@/lib/actions/admin";
import type { Category, Product, ProductStatus } from "@/lib/types";

type SellerLite = { id: number; name: string; email: string };
const TABS: { status: string; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "flagged", label: "Flagged" },
  { status: "all", label: "All" },
];

export function AdminProductsClient({
  products,
  categories,
  sellers,
}: {
  products: Product[];
  categories: Category[];
  sellers: SellerLite[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("pending");

  const categoryLabel = (id: string | null) =>
    categories.find((c) => c.id === id)?.label || id || "Uncategorized";

  const list = (filter === "all" ? products : products.filter((p) => (p.status || "pending") === filter)).slice();

  async function decide(id: number, status: ProductStatus, msg: string, kind: "success" | "warning") {
    const res = await setProductStatus(id, status);
    if (!res.ok) {
      toast(res.error || "Could not update.", "error");
      return;
    }
    toast(msg, kind);
    router.refresh();
  }

  async function toggleFeatured(id: number, next: boolean) {
    const res = await setProductFeatured(id, next);
    if (!res.ok) {
      toast(res.error || "Could not update.", "error");
      return;
    }
    toast(next ? "Product featured on the homepage." : "Product removed from featured.", "success");
    router.refresh();
  }

  return (
    <>
      <div className="tabs" role="tablist" id="prod-tabs" aria-label="Product status">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            className={`tab ${filter === t.status ? "tab--active" : ""}`}
            aria-selected={filter === t.status}
            onClick={() => setFilter(t.status)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data-table" aria-label="Products for verification">
          <thead>
            <tr>
              <th>Product</th>
              <th>Seller</th>
              <th>Category</th>
              <th>Base price</th>
              <th>Status</th>
              <th>Featured</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody id="verify-rows">
            {list.map((p) => {
              const seller = sellers.find((s) => s.id === p.seller_id);
              const status = p.status || "pending";
              const hasPhoto = Array.isArray(p.images) && p.images.length > 0;
              return (
                <tr key={p.id}>
                  <td>
                    <div className="cell-product">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="cell-thumb" src={productImageSrc(p, 0)} alt="" />
                      <div>
                        <strong>{p.title}</strong>
                        <div className="muted small">
                          {(p.description || "").slice(0, 90)}
                          {p.description && p.description.length > 90 ? "…" : ""}
                        </div>
                        {hasPhoto ? (
                          <div className="cell-thumb-strip">
                            {p.images!.slice(0, 3).map((src, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={src} alt="" />
                            ))}
                          </div>
                        ) : (
                          <small className="muted">Illustration fallback</small>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    {seller ? seller.name : "Seller"}
                    <br />
                    <small className="muted">{maskEmail(seller ? seller.email : "")}</small>
                  </td>
                  <td>{categoryLabel(p.category)}</td>
                  <td>{money(p.base_price)}</td>
                  <td>
                    <Pill status={status} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-pressed={p.is_featured}
                      aria-label={p.is_featured ? `Remove ${p.title} from featured` : `Feature ${p.title} on the homepage`}
                      onClick={() => toggleFeatured(p.id, !p.is_featured)}
                    >
                      <Icon name="sparkles" size={16} />
                    </button>
                  </td>
                  <td>
                    {status === "pending" ? (
                      <>
                        <button className="btn btn--primary btn--sm" onClick={() => decide(p.id, "approved", "Product approved.", "success")}>
                          Approve
                        </button>{" "}
                        <button className="btn btn--danger btn--sm" onClick={() => decide(p.id, "flagged", "Product flagged.", "warning")}>
                          Flag
                        </button>
                      </>
                    ) : status === "flagged" ? (
                      <>
                        <button className="btn btn--primary btn--sm" onClick={() => decide(p.id, "approved", "Product approved.", "success")}>
                          Approve
                        </button>{" "}
                        <button className="btn btn--ghost btn--sm" onClick={() => decide(p.id, "pending", "Re-queued for review.", "success")}>
                          Re-queue
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--danger btn--sm" onClick={() => decide(p.id, "flagged", "Product flagged.", "warning")}>
                          Flag
                        </button>{" "}
                        <button className="btn btn--ghost btn--sm" onClick={() => decide(p.id, "pending", "Re-queued for review.", "success")}>
                          Re-queue
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length === 0 ? <p className="empty">No products in this queue.</p> : null}
    </>
  );
}
