/**
 * The admin lists' tabs and row shapes (P2-07 to P2-10), apart from their
 * readers. lib/admin-lists.ts is server-only and only app/admin/ may import
 * it (scripts/check-page-props.mjs rule 3); the list components in
 * components/ take their row types and tab lists from here instead. Plain
 * data and types only: nothing here reads the database.
 */

import type { Product, Profile } from "@/lib/types";

// ---------------------------------------------------------------------------
// Orders (P2-07)
// ---------------------------------------------------------------------------

export const ORDER_VIEWS = [
  { value: "all", label: "Recent" },
  { value: "open", label: "In progress" },
  { value: "returns", label: "Returns" },
  { value: "refunds", label: "Refunds due" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export type OrderView = (typeof ORDER_VIEWS)[number]["value"];

export function orderView(raw: string | undefined): OrderView {
  return ORDER_VIEWS.find((v) => v.value === raw)?.value ?? "all";
}

export interface AdminOrderRow {
  id: number;
  createdAt: string;
  buyerName: string;
  /** The shop's name; null for an order from before one-order-per-seller (0015). */
  sellerName: string | null;
  total: number;
  paymentProvider: string | null;
  paymentStatus: string;
  status: string;
  refundDue: boolean;
  returnReason: string | null;
  cancelReason: string | null;
}

export interface AdminOrderList {
  rows: AdminOrderRow[];
  /** Rows in the current view with the search applied. */
  total: number;
  /** The page shown: the one asked for, clamped to the last, or the one holding ?focus=. */
  page: number;
  /** Each tab's count with the search applied; null when it needs a migration this database lacks. */
  counts: Record<OrderView, number | null>;
  /** A name search matched more people than are searched; the page says to narrow it. */
  capped: boolean;
  /** ?focus= named an order that is not in this view and search. */
  focusMissing: boolean;
  /** A migration this database lacks hides a column or a view (0014 refunds and reasons, 0015 shops). */
  degraded: boolean;
}

// ---------------------------------------------------------------------------
// Products (P2-08)
// ---------------------------------------------------------------------------

export const PRODUCT_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "flagged", label: "Flagged" },
  { value: "all", label: "All" },
] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number]["value"];

/**
 * ?status=, the review queue by default (the sidebar badge and the to-do
 * tile link there). An archived listing (0016) has no tab of its own and
 * shows under All, so a search result that links to one lands there.
 */
export function productTab(raw: string | undefined): ProductTab {
  if (raw === "archived") return "all";
  return PRODUCT_TABS.find((t) => t.value === raw)?.value ?? "pending";
}

/** One listing as the review queue shows it: no seller contact details, no full description. */
export type AdminProductRow = Pick<Product, "id" | "title" | "image" | "base_price" | "status" | "is_featured" | "created_at"> & {
  /** The description's first 90 characters, with "…" when there is more. */
  excerpt: string;
  /** Up to three photos, in their order. */
  images: string[];
  /** How many photos the listing has (images holds the first three). */
  photoCount: number;
  /** The shop's name, or the seller's own before they set one. */
  sellerName: string;
  categoryLabel: string;
  /** Why it was sent back (0016); null when it was not, or before 0016. */
  moderationReason: string | null;
  /** The homepage feature's place and window (0021); null before it. */
  featured_position: number | null;
  featured_from: string | null;
  featured_until: string | null;
};

export interface AdminProductList {
  rows: AdminProductRow[];
  /** Listings in the current tab with the search applied. */
  total: number;
  /** The page shown: the one asked for, clamped to the last, or the one holding ?focus=. */
  page: number;
  /** Each tab's count with the search applied. */
  counts: Record<ProductTab, number>;
  /** A title or name search matched more than are searched; the page says to narrow it. */
  capped: boolean;
  /** ?focus= named a listing that is not in this tab and search. */
  focusMissing: boolean;
  /**
   * This database lacks 0021 (the feature's place and window) or 0016 (the
   * reason a listing was sent back): the page says which update it needs,
   * since a feature saved now keeps no window.
   */
  degraded: { featureWindow: boolean; moderationReason: boolean };
}

// ---------------------------------------------------------------------------
// Users (P2-09)
// ---------------------------------------------------------------------------

/** How much an account has done: what the users list shows and what decides Delete or Anonymise. */
export interface UserFootprint {
  products: number;
  orders: number;
  reviews: number;
  tickets: number;
  consents: number;
}

export const USER_ROLES = [
  { value: "all", label: "Everyone" },
  { value: "buyer", label: "Buyers" },
  { value: "seller", label: "Sellers" },
  { value: "admin", label: "Admins" },
] as const;
export type UserRoleTab = (typeof USER_ROLES)[number]["value"];

export const USER_STATUSES = [
  { value: "any", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;
export type UserStatusTab = (typeof USER_STATUSES)[number]["value"];

/** ?role=; everyone by default (the Overview's "Active sellers" links to ?role=seller). */
export function userRole(raw: string | undefined): UserRoleTab {
  return USER_ROLES.find((r) => r.value === raw)?.value ?? "all";
}
/** ?status=; any by default. */
export function userStatus(raw: string | undefined): UserStatusTab {
  return USER_STATUSES.find((s) => s.value === raw)?.value ?? "any";
}

/**
 * One account as the admin list shows it. The email and disability fields
 * are here because the admin edits them (the edit dialog); phone and the
 * sign-in id are not.
 */
export type AdminUserRow = Pick<
  Profile,
  | "id"
  | "name"
  | "email"
  | "role"
  | "disability_type"
  | "assistive_needs"
  | "is_featured_seller"
  | "seller_story"
  | "account_status"
  | "created_at"
  | "updated_at"
> & {
  footprint: UserFootprint;
  /** Active PWD verification; null before verification exists (0017). */
  verified: boolean | null;
};

export interface AdminUserList {
  rows: AdminUserRow[];
  /** Accounts with this role, status and search. */
  total: number;
  /** The page shown: the one asked for, clamped to the last, or the one holding ?focus=. */
  page: number;
  /** Each role's count with the status and search applied. */
  roleCounts: Record<UserRoleTab, number>;
  /** Each status's count with the role and search applied. */
  statusCounts: Record<UserStatusTab, number>;
  /** The search matched more accounts than are searched; the page says to narrow it. */
  capped: boolean;
  /** ?focus= named an account that is not in this role, status and search. */
  focusMissing: boolean;
}

