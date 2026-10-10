"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDate, money, maskEmail, productImageSrc } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Pill } from "./Pill";
import { Icon } from "./Icon";
import { setProductStatus, setProductFeatured } from "@/lib/actions/admin";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Category, Product, ProductStatus } from "@/lib/types";
import { TableWrap } from "./TableWrap";
import { Tabs, TabPanel } from "./Tabs";
import { DeepLinkFocus } from "./DeepLinkFocus";
import { FeatureDialog, featureState } from "./FeatureDialog";

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
  // Dashboard search links here as ?status=<status>&focus=<id>; opening the
  // right tab first is what makes the focused row visible at all.
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("status") ?? "pending");

  const categoryLabel = (id: string | null) =>
    categories.find((c) => c.id === id)?.label || id || "Uncategorized";

  const list = (filter === "all" ? products : products.filter((p) => (p.status || "pending") === filter)).slice();
  const [flagging, setFlagging] = useState<Product | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(id: number, status: ProductStatus, msg: string, kind: "success" | "warning", reason?: string) {
    setBusy(true);
    const res = await setProductStatus(id, status, reason);
    setBusy(false);
    if (!res.ok) {
      if (flagging) setFlagError(res.error || "Could not update.");
      else toast(res.error || "Could not update.", "error");
      return;
    }
    setFlagging(null);
    toast(msg, kind);
    router.refresh();
  }

  function openFlag(p: Product) {
    setFlagError(null);
    setFlagging(p);
  }

  const [featuring, setFeaturing] = useState<Product | null>(null);

  return (
    <>
      <Tabs
        idPrefix="prod"
        label="Product status"
        value={filter}
        onChange={setFilter}
        items={TABS.map((t) => ({ value: t.status, label: t.label }))}
      />

      <DeepLinkFocus />
      <TabPanel idPrefix="prod" value={filter}>
      <TableWrap label="Products awaiting review">
        <table className="data-table data-table--cards" aria-label="Products for verification">
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
                <tr key={p.id} data-row-id={p.id}>
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
                    {p.is_featured ? (
                      <div className="small">
                        <strong>Featured</strong>
                        {p.featured_position != null ? <> · #{p.featured_position}</> : null}
                        {p.featured_until ? <div className="muted">until {formatDate(p.featured_until)}</div> : null}
                        {featureState(p) !== "live" ? <div className="field-error">{featureState(p)}</div> : null}
                      </div>
                    ) : null}
                    {status === "approved" || p.is_featured ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setFeaturing(p)}
                        aria-label={`${p.is_featured ? "Edit feature for" : "Feature"} ${p.title}`}
                      >
                        <Icon name="sparkles" size={14} /> {p.is_featured ? "Edit" : "Feature…"}
                      </button>
                    ) : (
                      <span className="muted small">Approve first</span>
                    )}
                  </td>
                  <td>
                    {status === "pending" ? (
                      <>
                        <button className="btn btn--primary btn--sm" onClick={() => decide(p.id, "approved", "Product approved.", "success")}>
                          Approve
                        </button>{" "}
                        <button className="btn btn--danger btn--sm" onClick={() => openFlag(p)}>
                          Ask for changes…
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
                        <button className="btn btn--danger btn--sm" onClick={() => openFlag(p)}>
                          Flag…
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
      </TableWrap>
      </TabPanel>
      {list.length === 0 ? <p className="empty">No products in this queue.</p> : null}

      <ConfirmDialog
        open={Boolean(flagging)}
        title={flagging ? `Ask for changes to "${flagging.title}"?` : ""}
        confirmLabel="Send to seller"
        tone="danger"
        busy={busy}
        error={flagError}
        reason={{
          label: "What should the seller change? (they see this)",
          required: true,
          minLength: 5,
          maxLength: 500,
          hint: "For example: photo is blurry; price looks wrong; description does not match the item; not a PWD-made product.",
        }}
        onCancel={() => setFlagging(null)}
        onConfirm={(reason) => {
          if (flagging) void decide(flagging.id, "flagged", "Sent back to the seller with your note.", "warning", reason);
        }}
      >
        <p>The listing is hidden from buyers until it is approved again. The seller is notified in the app and by email.</p>
      </ConfirmDialog>
      <FeatureDialog
        product={featuring}
        onClose={() => setFeaturing(null)}
        onSave={async (featured, win) => {
          if (!featuring) return "Nothing selected.";
          const res = await setProductFeatured(featuring.id, featured, win);
          if (!res.ok) return res.error || "Could not update.";
          toast(featured ? "Feature saved." : "No longer featured.", "success");
          setFeaturing(null);
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
