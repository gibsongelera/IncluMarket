import Link from "next/link";
import type { HistoryRow, SoldOutRow } from "@/lib/stock-audit";
import { formatDateTime, money, svgPlaceholder } from "@/lib/format";
import { TableWrap } from "./TableWrap";
import { Pill } from "./Pill";

/**
 * The two tables of Admin → Sold-out audit (app/admin/sold-out): when each
 * item sold out, and the photos and listings that were removed, with the
 * old photos. Server components; the page reads the rows (lib/stock-audit).
 */

const NOW: Record<SoldOutRow["state"], { status: string; label: string }> = {
  sold_out: { status: "pending", label: "Still sold out" },
  restocked: { status: "approved", label: "Back in stock" },
  deleted: { status: "archived", label: "Listing deleted" },
};

const LISTING: Record<string, string> = {
  approved: "Shown in the shop as Sold out",
  pending: "Waiting for review, not in the shop",
  flagged: "Sent back for changes, not in the shop",
  archived: "Unpublished by the seller",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const productLink = (id: number) => `/admin/products?status=all&focus=${id}`;
/** A kept photo is linked only if it is a web address (Storage) or a path on this site. */
const linkable = (url: string) => /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url);

export function SoldOutTable({ rows }: { rows: SoldOutRow[] }) {
  return (
    <TableWrap label="Sold-out items">
      <table className="data-table data-table--cards" aria-label="Sold-out items, newest first">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Seller</th>
            <th scope="col">Sold out</th>
            <th scope="col" className="num">
              Units sold
            </th>
            <th scope="col">Now</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const now = NOW[r.state];
            return (
              <tr key={r.eventId}>
                <td>
                  <div className="cell-identity">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="cell-identity__thumb"
                      src={r.photo ?? svgPlaceholder(r.emoji)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="cell-identity__text">
                      {r.state === "deleted" ? (
                        <span className="cell-identity__name">{r.title}</span>
                      ) : (
                        <Link className="cell-identity__name" href={productLink(r.productId)}>
                          {r.title}
                        </Link>
                      )}
                      <span className="cell-identity__meta">
                        <span className="cell-code">#{r.productId}</span>
                        {r.price != null ? <> · {money(r.price)}</> : null}
                      </span>
                    </span>
                  </div>
                </td>
                <td>{r.sellerName}</td>
                <td>
                  {r.approximate ? (
                    <>
                      <span>About {formatDateTime(r.soldOutAt)}</span>
                      <div className="muted small">From its last sale: it sold out before this report began.</div>
                    </>
                  ) : (
                    formatDateTime(r.soldOutAt)
                  )}
                </td>
                <td className="num">{r.unitsSold ?? "—"}</td>
                <td>
                  <Pill status={now.status} label={now.label} />
                  <div className="muted small">
                    {r.state === "restocked" ? (
                      <>
                        {r.restockedAt ? `Since ${formatDateTime(r.restockedAt)}` : "Restocked"}
                        {r.stockNow != null && r.stockNow > 0 ? ` · ${r.stockNow} left` : null}
                      </>
                    ) : r.state === "sold_out" ? (
                      LISTING[r.status ?? ""] ?? null
                    ) : (
                      <a href="#history">See removed photos and listings</a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <TableWrap label="Removed photos and listings">
      <table className="data-table data-table--cards" aria-label="Removed photos and listings, newest first">
        <thead>
          <tr>
            <th scope="col">Photos</th>
            <th scope="col">Item</th>
            <th scope="col">What happened</th>
            <th scope="col">When</th>
            <th scope="col">By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const what = r.kind === "photo_removed" ? "Photo removed" : "Listing deleted";
            const photos = r.photos.filter(linkable);
            return (
              <tr key={r.id}>
                <td>
                  {photos.length ? (
                    <span className="audit-photos">
                      {photos.map((src, i) => (
                        <a key={src + i} className="audit-photo" href={src} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={`${r.kind === "photo_removed" ? "Removed photo" : `Photo ${i + 1}`} of ${r.title}`}
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="sr-only"> (opens full size in a new tab)</span>
                        </a>
                      ))}
                    </span>
                  ) : null}
                  {r.inlinePhotos > 0 ? (
                    <div className="muted small">
                      {plural(r.inlinePhotos, "older photo")} saved before photo storage, so not kept.
                    </div>
                  ) : photos.length === 0 ? (
                    <span className="muted small">No photos</span>
                  ) : null}
                </td>
                <td>
                  <div className="cell-identity__text">
                    {r.listingExists ? (
                      <Link className="cell-identity__name" href={productLink(r.productId)}>
                        {r.title}
                      </Link>
                    ) : (
                      <span className="cell-identity__name">{r.title}</span>
                    )}
                    <span className="cell-identity__meta">
                      <span className="cell-code">#{r.productId}</span> · {r.sellerName}
                    </span>
                    <span className="cell-identity__meta">
                      At the time: {r.price != null ? money(r.price) : "no price"}
                      {r.stock != null ? ` · ${r.stock} in stock` : null}
                      {r.sold != null ? ` · ${r.sold} sold` : null}
                    </span>
                  </div>
                </td>
                <td>
                  <Pill status={r.kind === "photo_removed" ? "archived" : "returned"} label={what} />
                  {r.kind === "item_deleted" && r.options.length ? (
                    <div className="muted small">
                      {plural(r.options.length, "option")}:{" "}
                      {r.options.map((o) => `${[o.option, o.size].filter(Boolean).join(", ")} (${o.stock})`).join("; ")}
                    </div>
                  ) : null}
                </td>
                <td>{formatDateTime(r.at)}</td>
                <td>
                  {r.byName ? (
                    <span>
                      {r.byName}
                      {r.byRole ? <span className="muted small"> ({r.byRole})</span> : null}
                    </span>
                  ) : (
                    <span className="muted">Outside the app (database)</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
