/**
 * Sold-out episodes from the stock events of migration 0027: a "sold_out"
 * event opens one, the next "restocked" event for the same listing closes
 * it. Pure (no database, no imports), so Admin → Sold-out audit and its
 * Excel export read the same thing, and it is unit-tested.
 */

export interface StockEvent {
  id: number;
  product_id: number;
  seller_id: number | null;
  title: string;
  kind: "sold_out" | "restocked";
  approximate: boolean;
  occurred_at: string;
}

export interface Episode {
  /** The sell-out event's id: a stable key for the row. */
  eventId: number;
  productId: number;
  sellerId: number | null;
  /** The listing's title when it sold out. */
  title: string;
  soldOutAt: string;
  /** Dated from the last sale by the 0027 backfill, not seen happening. */
  approximate: boolean;
  restockedAt: string | null;
}

export type EpisodeState = "sold_out" | "restocked" | "deleted";

const time = (iso: string) => Date.parse(iso) || 0;

/** Newest sell-out first. */
export function soldOutEpisodes(events: StockEvent[]): Episode[] {
  const chrono = [...events].sort((a, b) => time(a.occurred_at) - time(b.occurred_at) || a.id - b.id);
  const open = new Map<number, Episode>();
  const done: Episode[] = [];
  for (const e of chrono) {
    if (e.kind === "sold_out") {
      // Two sell-outs in a row (the restock between them fell outside the
      // rows read): both are kept, the first without a restock date.
      const before = open.get(e.product_id);
      if (before) done.push(before);
      open.set(e.product_id, {
        eventId: e.id,
        productId: e.product_id,
        sellerId: e.seller_id,
        title: e.title,
        soldOutAt: e.occurred_at,
        approximate: e.approximate,
        restockedAt: null,
      });
    } else {
      const episode = open.get(e.product_id);
      if (!episode) continue; // its sell-out is older than the rows read
      episode.restockedAt = e.occurred_at;
      done.push(episode);
      open.delete(e.product_id);
    }
  }
  return [...done, ...open.values()].sort((a, b) => time(b.soldOutAt) - time(a.soldOutAt) || b.eventId - a.eventId);
}

/**
 * Where an episode stands now. A listing back above 0 with no restock event
 * (it was restocked before the events began) counts as back in stock.
 */
export function episodeState(episode: Episode, listing: { stock_total: number } | null | undefined): EpisodeState {
  if (episode.restockedAt) return "restocked";
  if (!listing) return "deleted";
  return listing.stock_total > 0 ? "restocked" : "sold_out";
}
