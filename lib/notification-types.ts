/**
 * Notification types as people choose them (C-24): a few plain-language
 * groups instead of internal type names. Pure, shared by the settings page,
 * the notifications filter and the server checks.
 *
 * Some notices are always sent — account status, PWD verification decisions,
 * listing moderation, system messages and order receipts — because they are
 * about the person's account or money, not marketing.
 */
import type { NotificationType } from "@/lib/types";

export type NotificationRole = "buyer" | "seller" | "admin";

export interface NotificationGroup {
  key: string;
  label: string;
  hint: string;
  types: NotificationType[];
  roles: NotificationRole[];
}

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  {
    key: "orders",
    label: "Orders and delivery",
    hint: "New orders, status changes, shipping updates.",
    types: ["new_order", "order_status", "shipping_update"],
    roles: ["buyer", "seller", "admin"],
  },
  {
    key: "messages",
    label: "Messages",
    hint: "New messages from buyers, sellers or support.",
    types: ["message", "chat_escalation"],
    roles: ["buyer", "seller", "admin"],
  },
  {
    key: "reviews",
    label: "Reviews and replies",
    hint: "New reviews of your products, and replies to your reviews.",
    types: ["new_review", "review_reply"],
    roles: ["buyer", "seller"],
  },
  {
    key: "deals",
    label: "Flash sales on saved items",
    hint: "When something in your wishlist goes on sale.",
    types: ["flash_sale"],
    roles: ["buyer"],
  },
  {
    key: "stock",
    label: "Low stock",
    hint: "When an item of yours is about to sell out.",
    types: ["low_stock"],
    roles: ["seller"],
  },
  {
    key: "payouts",
    label: "Payouts",
    hint: "When a payout is requested, paid or needs attention.",
    types: ["payout"],
    roles: ["seller"],
  },
];

/** Always delivered, in the app and by email. */
export const REQUIRED_TYPES: NotificationType[] = ["system", "account", "pwd_verification", "moderation"];

export function groupOf(type: string): NotificationGroup | null {
  return NOTIFICATION_GROUPS.find((g) => (g.types as string[]).includes(type)) ?? null;
}

export function groupsFor(role: NotificationRole): NotificationGroup[] {
  return NOTIFICATION_GROUPS.filter((g) => g.roles.includes(role));
}
