// IncluMarket domain types (mirror the im_* Postgres tables).

export type Role = "buyer" | "seller" | "admin";
export type ProductStatus = "pending" | "approved" | "flagged";
export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "returned";
export type TicketStatus = "open" | "in_progress" | "resolved";
export type Priority = "low" | "medium" | "high";

export interface Profile {
  id: number;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: Role;
  disability_type: string | null;
  assistive_needs: string | null;
  is_featured_seller: boolean;
  seller_story: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  label: string;
  folder: string;
}

export interface Product {
  id: number;
  seller_id: number;
  title: string;
  description: string | null;
  base_price: number;
  category: string | null;
  image: string | null;
  status: ProductStatus;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  images?: string[];
}

export interface WishlistItem {
  id: number;
  user_id: number;
  product_id: number;
  created_at: string;
}

export type NotificationType =
  | "low_stock"
  | "new_order"
  | "shipping_update"
  | "new_review"
  | "flash_sale"
  | "order_status"
  | "message"
  | "chat_escalation"
  | "system";

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Conversation {
  id: number;
  buyer_id: number;
  seller_id: number;
  product_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  sender_role: Role;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface FlashSale {
  id: number;
  product_id: number;
  discount_percent: number;
  starts_at: string;
  ends_at: string;
  created_by: number | null;
  created_at: string;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  color_name: string;
  size: string | null;
  stock_qty: number;
  sku_code: string;
}

export interface Order {
  id: number;
  buyer_id: number;
  total_amount: number;
  order_status: OrderStatus;
  created_at: string;
}

export interface OrderStatusHistoryEntry {
  id: number;
  order_id: number;
  status: OrderStatus;
  note: string | null;
  created_by: number | null;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  variant_id: number | null;
  quantity: number;
  unit_price: number;
}

export interface ProductReview {
  id: number;
  product_id: number;
  buyer_id: number;
  rating_score: number;
  comment_text: string | null;
  created_at: string;
}

export interface SupportTicket {
  id: number;
  user_id: number;
  subject: string;
  description_narrative: string;
  ticket_status: TicketStatus;
  priority_level: Priority;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
}

export interface TicketResponse {
  id: number;
  ticket_id: number;
  author_role: Role;
  author_id: number | null;
  message: string;
  created_at: string;
}

export interface ConsentLog {
  id: number;
  user_id: number | null;
  action: string;
  consent: boolean;
  purpose: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_role: string | null;
  action: string;
  target: string | null;
  created_at: string;
}

export interface ThemeSettings {
  id: number;
  theme_preset: string;
  color_nav: string | null;
  color_body: string | null;
  color_footer: string | null;
  color_nav_text: string | null;
  color_footer_text: string | null;
  updated_by: number | null;
  updated_at: string;
}

export interface CartItem {
  id?: number;
  product_id: number;
  variant_id: number;
  quantity: number;
  unit_price: number;
  added_at: string;
}

export interface SessionUser {
  user_id: number;
  role: Role;
  email: string;
  name: string;
}

/**
 * Report kinds for the admin Excel export.
 *
 * Lives here rather than in lib/reports/excel.ts so that client components can
 * import it without reaching into a module that pulls in ExcelJS and the
 * service-role client, and so that lib/actions/admin.ts does not have to
 * re-export it. A `"use server"` module may only export async functions, and a
 * type re-export there is not reliably erased before the server-action
 * transform runs.
 */
export type ReportType =
  | "users"
  | "products"
  | "orders"
  | "reviews"
  | "tickets"
  | "audit_logs"
  | "all";
