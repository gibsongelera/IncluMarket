# IncluMarket — Entity Relationship Diagram

All IncluMarket tables are namespaced with an `im_` prefix because the Supabase
project is shared with the wider InkluTrack ecosystem (avoids collisions with an
existing `public.profiles` / `public.orders`). Profiles link to Supabase Auth via
`auth_user_id`. Cart lines live in `im_cart_items`.

```mermaid
erDiagram
    im_profiles ||--o{ im_cart_items       : "owns (user_id)"
    im_profiles ||--o{ im_products         : "sells (seller_id)"
    im_profiles ||--o{ im_orders           : "places (buyer_id)"
    im_profiles ||--o{ im_product_reviews  : "writes (buyer_id)"
    im_profiles ||--o{ im_support_tickets  : "opens (user_id)"
    im_profiles ||--o{ im_support_tickets  : "assigned (assigned_to)"
    im_profiles ||--o{ im_ticket_responses : "authors (author_id)"
    im_profiles ||--o{ im_consent_logs     : "consents (user_id)"
    im_profiles ||--o{ im_audit_logs       : "acts (actor_id)"
    im_profiles ||--o| im_theme_settings   : "updates (updated_by)"
    im_profiles ||--o| im_ui_prefs         : "owns (user_id)"

    im_categories ||--o{ im_products        : "groups (category)"

    im_products ||--o{ im_product_variants : "has (product_id)"
    im_products ||--o{ im_product_images   : "has (product_id)"
    im_products ||--o{ im_product_reviews  : "receives (product_id)"
    im_products ||--o{ im_order_items      : "sold in (product_id)"
    im_products ||--o{ im_cart_items       : "in cart (product_id)"

    im_product_variants ||--o{ im_order_items : "ordered as (variant_id)"
    im_product_variants ||--o{ im_cart_items  : "cart variant (variant_id)"

    im_orders ||--o{ im_order_items : "contains (order_id)"

    im_support_tickets ||--o{ im_ticket_responses : "thread (ticket_id)"

    im_profiles {
        bigint  id PK
        uuid    auth_user_id FK "auth.users(id), unique"
        text    name
        text    email UK
        text    role "CHECK buyer|seller|admin"
        text    disability_type
        text    assistive_needs
        timestamptz created_at
        timestamptz updated_at
    }

    im_categories {
        text id PK
        text label
        text folder
    }

    im_products {
        bigint  id PK
        bigint  seller_id FK "im_profiles ON DELETE CASCADE"
        text    title
        text    description
        numeric base_price "CHECK >= 0"
        text    category FK "im_categories ON DELETE SET NULL"
        text    image "emoji fallback"
        text    status "CHECK pending|approved|flagged"
        timestamptz created_at
        timestamptz updated_at
    }

    im_product_variants {
        bigint  id PK
        bigint  product_id FK "im_products ON DELETE CASCADE"
        text    color_name
        text    size
        integer stock_qty "CHECK >= 0"
        text    sku_code UK
    }

    im_product_images {
        bigint  id PK
        bigint  product_id FK "im_products ON DELETE CASCADE"
        text    url
        integer position
    }

    im_orders {
        bigint  id PK
        bigint  buyer_id FK "im_profiles ON DELETE CASCADE"
        numeric total_amount "CHECK >= 0"
        text    order_status "CHECK pending|processing|shipped|delivered|returned"
        timestamptz created_at
    }

    im_order_items {
        bigint  id PK
        bigint  order_id FK "im_orders ON DELETE CASCADE"
        bigint  product_id FK "im_products ON DELETE SET NULL"
        bigint  variant_id FK "im_product_variants ON DELETE SET NULL"
        integer quantity "CHECK > 0"
        numeric unit_price "CHECK >= 0"
    }

    im_product_reviews {
        bigint  id PK
        bigint  product_id FK "im_products ON DELETE CASCADE"
        bigint  buyer_id FK "im_profiles ON DELETE CASCADE"
        integer rating_score "CHECK 1..5"
        text    comment_text
        timestamptz created_at
    }

    im_support_tickets {
        bigint  id PK
        bigint  user_id FK "im_profiles ON DELETE CASCADE"
        text    subject
        text    description_narrative
        text    ticket_status "CHECK open|in_progress|resolved"
        text    priority_level "CHECK low|medium|high"
        bigint  assigned_to FK "im_profiles ON DELETE SET NULL"
        timestamptz created_at
        timestamptz updated_at
    }

    im_ticket_responses {
        bigint  id PK
        bigint  ticket_id FK "im_support_tickets ON DELETE CASCADE"
        text    author_role "CHECK buyer|seller|admin"
        bigint  author_id FK "im_profiles ON DELETE SET NULL"
        text    message
        timestamptz created_at
    }

    im_consent_logs {
        bigint  id PK
        bigint  user_id FK "im_profiles ON DELETE CASCADE"
        text    action
        boolean consent
        text    purpose
        timestamptz created_at
    }

    im_audit_logs {
        bigint  id PK
        bigint  actor_id FK "im_profiles ON DELETE SET NULL"
        text    actor_role
        text    action
        text    target
        timestamptz created_at
    }

    im_theme_settings {
        integer id PK "singleton, CHECK id = 1"
        text    theme_preset
        text    color_nav
        text    color_body
        text    color_footer
        text    color_nav_text
        text    color_footer_text
        bigint  updated_by FK "im_profiles ON DELETE SET NULL"
        timestamptz updated_at
    }

    im_ui_prefs {
        bigint  user_id PK "FK im_profiles ON DELETE CASCADE"
        text    contrast "CHECK default|high"
        text    theme_preset
        timestamptz updated_at
    }

    im_profiles ||--o{ im_wishlists          : "saves (user_id)"
    im_profiles ||--o{ im_order_status_history : "logs (created_by)"
    im_profiles ||--o{ im_flash_sales        : "creates (created_by)"
    im_profiles ||--o{ im_notifications      : "receives (user_id)"
    im_profiles ||--o{ im_conversations      : "buys in (buyer_id)"
    im_profiles ||--o{ im_conversations      : "sells in (seller_id)"
    im_profiles ||--o{ im_messages           : "sends (sender_id)"
    im_profiles ||--o{ im_chat_sessions      : "opens (user_id)"

    im_products ||--o{ im_wishlists         : "wishlisted (product_id)"
    im_products ||--o{ im_flash_sales       : "on sale (product_id)"
    im_products ||--o{ im_conversations     : "discussed (product_id)"

    im_orders ||--o{ im_order_status_history : "history (order_id)"

    im_support_tickets ||--o| im_chat_sessions : "escalated to (escalated_ticket_id)"

    im_conversations ||--o{ im_messages : "thread (conversation_id)"

    im_chat_sessions ||--o{ im_chat_messages : "transcript (session_id)"

    im_wishlists {
        bigint  id PK
        bigint  user_id FK "im_profiles ON DELETE CASCADE"
        bigint  product_id FK "im_products ON DELETE CASCADE, UNIQUE(user_id,product_id)"
        timestamptz created_at
    }

    im_order_status_history {
        bigint  id PK
        bigint  order_id FK "im_orders ON DELETE CASCADE"
        text    status "CHECK pending|processing|shipped|delivered|returned"
        text    note
        bigint  created_by FK "im_profiles ON DELETE SET NULL"
        timestamptz created_at
    }

    im_flash_sales {
        bigint  id PK
        bigint  product_id FK "im_products ON DELETE CASCADE"
        numeric discount_percent "CHECK 0 < x <= 90"
        timestamptz starts_at
        timestamptz ends_at "CHECK ends_at > starts_at"
        bigint  created_by FK "im_profiles ON DELETE SET NULL"
        timestamptz created_at
    }

    im_notifications {
        bigint  id PK
        bigint  user_id FK "im_profiles ON DELETE CASCADE"
        text    type "CHECK low_stock|new_order|shipping_update|new_review|flash_sale|order_status|message|chat_escalation|system"
        text    title
        text    body
        text    link
        boolean is_read
        timestamptz created_at
    }

    im_newsletter_subscribers {
        bigint  id PK
        text    email UK
        timestamptz subscribed_at
        timestamptz unsubscribed_at
        text    source
    }

    im_conversations {
        bigint  id PK
        bigint  buyer_id FK "im_profiles ON DELETE CASCADE, UNIQUE(buyer_id,seller_id)"
        bigint  seller_id FK "im_profiles ON DELETE CASCADE"
        bigint  product_id FK "im_products ON DELETE SET NULL"
        timestamptz created_at
        timestamptz updated_at
    }

    im_messages {
        bigint  id PK
        bigint  conversation_id FK "im_conversations ON DELETE CASCADE"
        bigint  sender_id FK "im_profiles ON DELETE SET NULL"
        text    sender_role "CHECK buyer|seller|admin"
        text    body
        timestamptz created_at
        timestamptz read_at
    }

    im_chat_sessions {
        bigint  id PK
        bigint  user_id FK "im_profiles ON DELETE SET NULL, nullable"
        text    guest_id "nullable; user_id or guest_id required"
        text    status "CHECK open|escalated|closed"
        bigint  escalated_ticket_id FK "im_support_tickets ON DELETE SET NULL"
        timestamptz created_at
        timestamptz updated_at
    }

    im_chat_messages {
        bigint  id PK
        bigint  session_id FK "im_chat_sessions ON DELETE CASCADE"
        text    role "CHECK user|bot|system"
        text    body
        timestamptz created_at
    }
```

`im_products.is_featured` (boolean, default false) and
`im_profiles.is_featured_seller` / `im_profiles.seller_story` are new columns
on existing tables (migration `0005_growth_schema.sql`), not shown as
separate entities above.

## Referential integrity summary

| Child                | Parent(s)                              | On delete            |
| -------------------- | -------------------------------------- | -------------------- |
| im_products          | im_profiles (seller), im_categories    | CASCADE / SET NULL   |
| im_product_variants  | im_products                            | CASCADE              |
| im_product_images    | im_products                            | CASCADE              |
| im_orders            | im_profiles (buyer)                    | CASCADE              |
| im_order_items       | im_orders, im_products, im_variants    | CASCADE / SET NULL   |
| im_product_reviews   | im_products, im_profiles (buyer)       | CASCADE              |
| im_support_tickets   | im_profiles (user, assigned_to)        | CASCADE / SET NULL   |
| im_ticket_responses  | im_support_tickets, im_profiles        | CASCADE / SET NULL   |
| im_consent_logs      | im_profiles                            | CASCADE              |
| im_audit_logs        | im_profiles (actor)                    | SET NULL (preserve)  |
| im_theme_settings    | im_profiles (updated_by)               | SET NULL             |
| im_ui_prefs          | im_profiles                            | CASCADE              |

Audit rows survive user deletion (`actor_id` set to NULL) so the compliance trail
stays intact — the one intentional exception to the cascade rules.
