import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/format";
import type { ReportType } from "@/lib/types";



type Db = ReturnType<typeof createAdminClient>;

/** ISO 8601-like Excel date-time (sortable, locale-neutral). */
const ISO_DATETIME = "yyyy-mm-dd hh:mm:ss";
/** Integer IDs — no thousands separators (ISO/IEC numeric clarity). */
const INT_FMT = "0";
/** ISO 4217 PHP amount — numeric cell, currency code in header. */
const PHP_AMT = '#,##0.00';
const CURRENCY = "PHP";

const REPORT_META: Record<
  Exclude<ReportType, "all">,
  { sheet: string; slug: string; title: string }
> = {
  users: { sheet: "Users", slug: "Users", title: "Users Report" },
  products: { sheet: "Products", slug: "Products", title: "Products Report" },
  orders: { sheet: "Orders", slug: "Orders", title: "Orders Report" },
  reviews: { sheet: "Reviews", slug: "Reviews", title: "Reviews Report" },
  tickets: { sheet: "Support Tickets", slug: "Support_Tickets", title: "Support Tickets Report" },
  audit_logs: { sheet: "Audit Logs", slug: "Audit_Logs", title: "Audit Logs Report" },
};

type NameMaps = {
  profileName: Map<number, string>;
  productTitle: Map<number, string>;
  categoryLabel: Map<string, string>;
};

async function loadNameMaps(db: Db): Promise<NameMaps> {
  const [profiles, products, categories] = await Promise.all([
    db.from("im_profiles").select("id,name"),
    db.from("im_products").select("id,title"),
    db.from("im_categories").select("id,label"),
  ]);

  return {
    profileName: new Map((profiles.data ?? []).map((p) => [Number(p.id), String(p.name ?? "")])),
    productTitle: new Map((products.data ?? []).map((p) => [Number(p.id), String(p.title ?? "")])),
    categoryLabel: new Map(
      (categories.data ?? []).map((c) => [String(c.id), String(c.label ?? c.id)])
    ),
  };
}

function nameOf(map: Map<number, string>, id: number | null | undefined): string {
  if (id == null || Number.isNaN(Number(id))) return "";
  return map.get(Number(id)) || "";
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function styleSheet(sheet: ExcelJS.Worksheet, columnCount: number) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (sheet.rowCount > 0 && columnCount > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnCount },
    };
  }
}

function applyColumnFormats(
  sheet: ExcelJS.Worksheet,
  formats: Record<string, string | undefined>
) {
  for (const col of sheet.columns) {
    const key = String(col.key || "");
    const fmt = formats[key];
    if (fmt) col.numFmt = fmt;
  }
}

/**
 * ISO 8601 UTC calendar date for filenames: YYYY-MM-DD
 * Full stamp: IncluMarket_<Slug>_YYYY-MM-DD.xlsx
 */
export function reportFilename(type: ReportType, when = new Date()): string {
  const ymd = when.toISOString().slice(0, 10);
  if (type === "all") return `IncluMarket_Full_Platform_Report_${ymd}.xlsx`;
  return `IncluMarket_${REPORT_META[type].slug}_Report_${ymd}.xlsx`;
}

async function addUsersSheet(workbook: ExcelJS.Workbook, db: Db) {
  const { data } = await db.from("im_profiles").select("*").order("id");
  const sheet = workbook.addWorksheet(REPORT_META.users.sheet);
  sheet.columns = [
    { header: "User ID", key: "id", width: 10 },
    { header: "Full Name", key: "name", width: 28 },
    { header: "Email (masked)", key: "email", width: 28 },
    { header: "Role", key: "role", width: 12 },
    { header: "Disability Type", key: "disability_type", width: 22 },
    { header: "Account Status", key: "account_status", width: 16 },
    { header: "Featured Seller", key: "featured", width: 14 },
    { header: "Joined At (UTC)", key: "created_at", width: 22 },
  ];
  applyColumnFormats(sheet, { id: INT_FMT, created_at: ISO_DATETIME });
  sheet.addRows(
    (data ?? []).map((u) => ({
      id: Number(u.id),
      name: u.name ?? "",
      email: maskEmail(u.email),
      role: u.role ?? "",
      disability_type: u.disability_type || "",
      account_status: u.account_status || "active",
      featured: u.is_featured_seller ? "Yes" : "No",
      created_at: asDate(u.created_at),
    }))
  );
  styleSheet(sheet, sheet.columns.length);
}

async function addProductsSheet(workbook: ExcelJS.Workbook, db: Db, maps: NameMaps) {
  const { data } = await db.from("im_products").select("*").order("id");
  const sheet = workbook.addWorksheet(REPORT_META.products.sheet);
  sheet.columns = [
    { header: "Product ID", key: "id", width: 12 },
    { header: "Product Title", key: "title", width: 32 },
    { header: "Seller ID", key: "seller_id", width: 10 },
    { header: "Seller Name", key: "seller_name", width: 26 },
    { header: "Category Code", key: "category_code", width: 14 },
    { header: "Category Name", key: "category_name", width: 20 },
    { header: `Base Price (${CURRENCY})`, key: "base_price", width: 16 },
    { header: "Currency (ISO 4217)", key: "currency", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Featured", key: "featured", width: 10 },
    { header: "Created At (UTC)", key: "created_at", width: 22 },
  ];
  applyColumnFormats(sheet, {
    id: INT_FMT,
    seller_id: INT_FMT,
    base_price: PHP_AMT,
    created_at: ISO_DATETIME,
  });
  sheet.addRows(
    (data ?? []).map((p) => {
      const cat = p.category ? String(p.category) : "";
      return {
        id: Number(p.id),
        title: p.title ?? "",
        seller_id: Number(p.seller_id),
        seller_name: nameOf(maps.profileName, p.seller_id),
        category_code: cat,
        category_name: cat ? maps.categoryLabel.get(cat) || cat : "",
        base_price: Number(p.base_price) || 0,
        currency: CURRENCY,
        status: p.status ?? "",
        featured: p.is_featured ? "Yes" : "No",
        created_at: asDate(p.created_at),
      };
    })
  );
  styleSheet(sheet, sheet.columns.length);
}

async function addOrdersSheet(workbook: ExcelJS.Workbook, db: Db, maps: NameMaps) {
  const { data } = await db.from("im_orders").select("*").order("id");
  const sheet = workbook.addWorksheet(REPORT_META.orders.sheet);
  sheet.columns = [
    { header: "Order ID", key: "id", width: 10 },
    { header: "Buyer ID", key: "buyer_id", width: 10 },
    { header: "Buyer Name", key: "buyer_name", width: 26 },
    { header: `Total Amount (${CURRENCY})`, key: "total_amount", width: 18 },
    { header: "Currency (ISO 4217)", key: "currency", width: 16 },
    { header: "Status", key: "order_status", width: 14 },
    { header: "Payment Provider", key: "payment_provider", width: 16 },
    { header: "Shipping Name", key: "shipping_name", width: 24 },
    { header: "Shipping Address", key: "shipping_address", width: 36 },
    { header: "Shipping Phone", key: "shipping_phone", width: 16 },
    { header: "Placed At (UTC)", key: "created_at", width: 22 },
  ];
  applyColumnFormats(sheet, {
    id: INT_FMT,
    buyer_id: INT_FMT,
    total_amount: PHP_AMT,
    created_at: ISO_DATETIME,
  });
  sheet.addRows(
    (data ?? []).map((o) => ({
      id: Number(o.id),
      buyer_id: Number(o.buyer_id),
      buyer_name: nameOf(maps.profileName, o.buyer_id),
      total_amount: Number(o.total_amount) || 0,
      currency: CURRENCY,
      order_status: o.order_status ?? "",
      payment_provider: o.payment_provider || "",
      shipping_name: o.shipping_name || "",
      shipping_address: o.shipping_address || "",
      shipping_phone: o.shipping_phone || "",
      created_at: asDate(o.created_at),
    }))
  );
  styleSheet(sheet, sheet.columns.length);
}

async function addReviewsSheet(workbook: ExcelJS.Workbook, db: Db, maps: NameMaps) {
  const { data } = await db.from("im_product_reviews").select("*").order("id");
  const sheet = workbook.addWorksheet(REPORT_META.reviews.sheet);
  sheet.columns = [
    { header: "Review ID", key: "id", width: 10 },
    { header: "Product ID", key: "product_id", width: 12 },
    { header: "Product Title", key: "product_title", width: 30 },
    { header: "Buyer ID", key: "buyer_id", width: 10 },
    { header: "Buyer Name", key: "buyer_name", width: 26 },
    { header: "Rating (1-5)", key: "rating_score", width: 12 },
    { header: "Comment", key: "comment_text", width: 50 },
    { header: "Posted At (UTC)", key: "created_at", width: 22 },
  ];
  applyColumnFormats(sheet, {
    id: INT_FMT,
    product_id: INT_FMT,
    buyer_id: INT_FMT,
    rating_score: "0",
    created_at: ISO_DATETIME,
  });
  sheet.addRows(
    (data ?? []).map((r) => ({
      id: Number(r.id),
      product_id: Number(r.product_id),
      product_title: nameOf(maps.productTitle, r.product_id),
      buyer_id: Number(r.buyer_id),
      buyer_name: nameOf(maps.profileName, r.buyer_id),
      rating_score: Number(r.rating_score) || 0,
      comment_text: r.comment_text || "",
      created_at: asDate(r.created_at),
    }))
  );
  styleSheet(sheet, sheet.columns.length);
}

async function addTicketsSheet(workbook: ExcelJS.Workbook, db: Db, maps: NameMaps) {
  const { data } = await db.from("im_support_tickets").select("*").order("id");
  const sheet = workbook.addWorksheet(REPORT_META.tickets.sheet);
  sheet.columns = [
    { header: "Ticket ID", key: "id", width: 10 },
    { header: "Requester ID", key: "user_id", width: 12 },
    { header: "Requester Name", key: "requester_name", width: 26 },
    { header: "Subject", key: "subject", width: 32 },
    { header: "Status", key: "ticket_status", width: 14 },
    { header: "Priority", key: "priority_level", width: 10 },
    { header: "Assignee ID", key: "assigned_to", width: 12 },
    { header: "Assignee Name", key: "assignee_name", width: 26 },
    { header: "Opened At (UTC)", key: "created_at", width: 22 },
  ];
  applyColumnFormats(sheet, {
    id: INT_FMT,
    user_id: INT_FMT,
    assigned_to: INT_FMT,
    created_at: ISO_DATETIME,
  });
  sheet.addRows(
    (data ?? []).map((t) => ({
      id: Number(t.id),
      user_id: Number(t.user_id),
      requester_name: nameOf(maps.profileName, t.user_id),
      subject: t.subject ?? "",
      ticket_status: t.ticket_status ?? "",
      priority_level: t.priority_level ?? "",
      assigned_to: t.assigned_to == null ? "" : Number(t.assigned_to),
      assignee_name: nameOf(maps.profileName, t.assigned_to),
      created_at: asDate(t.created_at),
    }))
  );
  styleSheet(sheet, sheet.columns.length);
}

async function addAuditLogsSheet(workbook: ExcelJS.Workbook, db: Db, maps: NameMaps) {
  const { data } = await db
    .from("im_audit_logs")
    .select("*")
    .order("id", { ascending: false })
    .limit(5000);
  const sheet = workbook.addWorksheet(REPORT_META.audit_logs.sheet);
  sheet.columns = [
    { header: "Log ID", key: "id", width: 10 },
    { header: "Actor ID", key: "actor_id", width: 10 },
    { header: "Actor Name", key: "actor_name", width: 26 },
    { header: "Actor Role", key: "actor_role", width: 12 },
    { header: "Action", key: "action", width: 28 },
    { header: "Target", key: "target", width: 28 },
    { header: "Timestamp (UTC)", key: "created_at", width: 22 },
  ];
  applyColumnFormats(sheet, {
    id: INT_FMT,
    actor_id: INT_FMT,
    created_at: ISO_DATETIME,
  });
  sheet.addRows(
    (data ?? []).map((a) => ({
      id: Number(a.id),
      actor_id: a.actor_id == null ? "" : Number(a.actor_id),
      actor_name: nameOf(maps.profileName, a.actor_id),
      actor_role: a.actor_role || "",
      action: a.action ?? "",
      target: a.target || "",
      created_at: asDate(a.created_at),
    }))
  );
  styleSheet(sheet, sheet.columns.length);
}

export async function buildReportWorkbook(
  type: ReportType,
  db: Db = createAdminClient()
): Promise<{ workbook: ExcelJS.Workbook; filename: string }> {
  const when = new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IncluMarket";
  workbook.lastModifiedBy = "IncluMarket Admin";
  workbook.created = when;
  workbook.modified = when;
  workbook.company = "IncluMarket — AVRC Region IX";
  workbook.title =
    type === "all"
      ? "IncluMarket Full Platform Report"
      : `IncluMarket ${REPORT_META[type].title}`;
  workbook.subject = "Administrative data export (ISO 8601 dates, ISO 4217 PHP)";
  workbook.description =
    "Generated for internal administration. Emails are masked. Monetary amounts use ISO 4217 currency code PHP.";

  const maps = await loadNameMaps(db);
  const types: Exclude<ReportType, "all">[] =
    type === "all" ? (Object.keys(REPORT_META) as Exclude<ReportType, "all">[]) : [type];

  for (const t of types) {
    switch (t) {
      case "users":
        await addUsersSheet(workbook, db);
        break;
      case "products":
        await addProductsSheet(workbook, db, maps);
        break;
      case "orders":
        await addOrdersSheet(workbook, db, maps);
        break;
      case "reviews":
        await addReviewsSheet(workbook, db, maps);
        break;
      case "tickets":
        await addTicketsSheet(workbook, db, maps);
        break;
      case "audit_logs":
        await addAuditLogsSheet(workbook, db, maps);
        break;
    }
  }

  return { workbook, filename: reportFilename(type, when) };
}
