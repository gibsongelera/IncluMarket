// InkluMarket domain types (mirror the im_* Postgres tables).

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
  created_at: string;
  updated_at: string;
  images?: string[];
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
