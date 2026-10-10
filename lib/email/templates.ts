import "server-only";

/**
 * Email templates, authored in code rather than in Brevo's template designer.
 *
 * Keeping them here means they are version-controlled, reviewable in a diff,
 * and — the reason that matters most for this project — auditable for
 * accessibility. A template living in a vendor dashboard is invisible to both.
 *
 * Every template ships a real text alternative (screen readers, low bandwidth,
 * and clients with images off), uses a single-column 600px table, states its
 * information in text rather than images, and draws its colours from
 * styles/tokens.css values that meet 4.5:1 against their background.
 */

export type EmailKind =
  | "order_confirmation"
  | "order_paid"
  | "seller_new_order"
  | "seller_decision"
  | "ticket_reply"
  | "newsletter_welcome"
  | "signup_confirm"
  | "password_reset"
  | "account_status"
  | "pwd_verification";

export type TemplateData = Record<string, unknown>;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Token values mirrored from styles/tokens.css. Email clients have no CSS
// custom property support, so these are literals by necessity.
const BRAND_DEEP = "#00287A";
const TEXT = "#212529";
const MUTED = "#5A6169";
const BORDER = "#DEE2E6";
const SURFACE = "#F5F7FA";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function peso(value: unknown): string {
  const n = Number(value ?? 0);
  return `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://inclumarket.vercel.app";
}

/** Single-column shell. `lang` is set so screen readers announce correctly. */
function shell(headline: string, bodyHtml: string, ctaLabel?: string, ctaHref?: string): string {
  const cta =
    ctaLabel && ctaHref
      ? `<tr><td style="padding:8px 24px 24px">
           <a href="${esc(ctaHref)}"
              style="display:inline-block;background:${BRAND_DEEP};color:#FFFFFF;
                     text-decoration:none;padding:12px 20px;border-radius:8px;
                     font-weight:700;font-size:16px">${esc(ctaLabel)}</a>
         </td></tr>`
      : "";

  return `<div lang="en" style="margin:0;padding:24px 12px;background:${SURFACE};
     font-family:'Nunito Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
     color:${TEXT};font-size:16px;line-height:1.5">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="max-width:600px;margin:0 auto;width:100%;background:#FFFFFF;
                border:1px solid ${BORDER};border-radius:12px">
    <tr>
      <td style="padding:20px 24px;background:${BRAND_DEEP};border-radius:12px 12px 0 0">
        <span style="color:#FFFFFF;font-size:20px;font-weight:800">InclusiveMarket</span>
      </td>
    </tr>
    <tr><td style="padding:24px 24px 8px">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${TEXT}">${esc(headline)}</h1>
      ${bodyHtml}
    </td></tr>
    ${cta}
    <tr><td style="padding:16px 24px 24px;border-top:1px solid ${BORDER};color:${MUTED};font-size:14px">
      InclusiveMarket — a livelihood marketplace for Persons with Disabilities.<br>
      <a href="${esc(siteUrl())}" style="color:${BRAND_DEEP}">${esc(siteUrl())}</a>
    </td></tr>
  </table>
</div>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;color:${TEXT}">${text}</p>`;
}

export function renderTemplate(kind: EmailKind, d: TemplateData): RenderedEmail {
  const url = siteUrl();

  switch (kind) {
    case "order_confirmation": {
      const id = d.orderId;
      const total = peso(d.total);
      return {
        subject: `Order #${id} received — InclusiveMarket`,
        html: shell(
          `Thank you, ${esc(d.buyerName)}`,
          p(`We have received your order <strong>#${esc(id)}</strong>.`) +
            p(`Order total: <strong>${esc(total)}</strong>`) +
            p(
              d.paymentMethod === "cod"
                ? "You chose <strong>cash on delivery</strong>. Please have the exact amount ready when your order arrives."
                : "We will confirm again as soon as your payment is completed."
            ) +
            p("You can follow every step of your order from My Orders."),
          "View my orders",
          `${url}/buyer/orders`
        ),
        text:
          `Thank you, ${d.buyerName}.\n\n` +
          `We have received your order #${id}.\n` +
          `Order total: ${total}\n\n` +
          (d.paymentMethod === "cod"
            ? "You chose cash on delivery. Please have the exact amount ready when your order arrives.\n\n"
            : "We will confirm again as soon as your payment is completed.\n\n") +
          `Follow your order: ${url}/buyer/orders\n`,
      };
    }

    case "order_paid": {
      const id = d.orderId;
      const total = peso(d.total);
      return {
        subject: `Payment received for order #${id} — InclusiveMarket`,
        html: shell(
          "Your payment went through",
          p(`Order <strong>#${esc(id)}</strong> is now paid.`) +
            p(`Amount paid: <strong>${esc(total)}</strong>`) +
            p("Your seller has been notified and will start preparing your order."),
          "Track this order",
          `${url}/buyer/orders`
        ),
        text:
          `Your payment went through.\n\n` +
          `Order #${id} is now paid.\nAmount paid: ${total}\n\n` +
          `Your seller has been notified and will start preparing your order.\n\n` +
          `Track this order: ${url}/buyer/orders\n`,
      };
    }

    case "seller_new_order": {
      const id = d.orderId;
      return {
        subject: `New order #${id} — InclusiveMarket`,
        html: shell(
          "You have a new order",
          p(`Order <strong>#${esc(id)}</strong> includes one or more of your products.`) +
            p(`Items from your shop: <strong>${esc(d.itemCount)}</strong>`) +
            p("Open your orders page to confirm and start fulfilment."),
          "Open my orders",
          `${url}/seller/orders`
        ),
        text:
          `You have a new order.\n\n` +
          `Order #${id} includes one or more of your products.\n` +
          `Items from your shop: ${d.itemCount}\n\n` +
          `Open your orders page: ${url}/seller/orders\n`,
      };
    }

    case "seller_decision": {
      const approved = d.status === "approved";
      return {
        subject: approved
          ? `"${d.productTitle}" is now live — InclusiveMarket`
          : `"${d.productTitle}" needs changes — InclusiveMarket`,
        html: shell(
          approved ? "Your listing is approved" : "Your listing needs changes",
          p(`<strong>${esc(d.productTitle)}</strong>`) +
            p(
              approved
                ? "Your product has been reviewed and is now visible to buyers in the catalog."
                : `Our reviewers could not approve this listing yet.${
                    d.reason ? ` Reason: ${esc(d.reason)}` : ""
                  }`
            ) +
            p(
              approved
                ? "Keep your stock levels up to date so buyers can order without interruption."
                : "You can edit the listing and it will be reviewed again automatically."
            ),
          "Manage my products",
          `${url}/seller/products`
        ),
        text:
          `${d.productTitle}\n\n` +
          (approved
            ? "Your product has been reviewed and is now visible to buyers in the catalog.\n"
            : `Our reviewers could not approve this listing yet.${
                d.reason ? ` Reason: ${d.reason}` : ""
              }\nYou can edit the listing and it will be reviewed again.\n`) +
          `\nManage your products: ${url}/seller/products\n`,
      };
    }

    case "ticket_reply": {
      return {
        subject: `Reply to your support request — InclusiveMarket`,
        html: shell(
          "Our support team replied",
          p(`Re: <strong>${esc(d.subject)}</strong>`) +
            `<blockquote style="margin:0 0 12px;padding:12px 16px;background:${SURFACE};
               border-left:4px solid ${BRAND_DEEP};border-radius:6px;color:${TEXT}">
               ${esc(d.message)}</blockquote>` +
            p("You can reply from your support page."),
          "Open support",
          `${url}/buyer/support`
        ),
        text:
          `Our support team replied.\n\n` +
          `Re: ${d.subject}\n\n${d.message}\n\n` +
          `Reply from your support page: ${url}/buyer/support\n`,
      };
    }

    case "newsletter_welcome": {
      return {
        subject: "You are subscribed — InclusiveMarket",
        html: shell(
          "Thanks for subscribing",
          p("You will hear from us when new PWD-made products and flash sales go live.") +
            p("We send rarely, and you can unsubscribe from any email."),
          "Browse the marketplace",
          `${url}/home`
        ),
        text:
          `Thanks for subscribing.\n\n` +
          `You will hear from us when new PWD-made products and flash sales go live.\n` +
          `We send rarely, and you can unsubscribe from any email.\n\n` +
          `Browse the marketplace: ${url}/home\n`,
      };
    }

    case "account_status": {
      const suspended = d.status === "suspended";
      return {
        subject: suspended
          ? "Your InclusiveMarket account is suspended"
          : "Your InclusiveMarket account is active again",
        html: shell(
          suspended ? "Your account is suspended" : "Your account is active again",
          p(`Hello${d.name ? ` ${esc(d.name)}` : ""}.`) +
            (suspended
              ? p("An administrator has suspended your account, so you cannot sign in for now.") +
                p(`Reason: <strong>${esc(d.reason)}</strong>`) +
                p("If you think this is a mistake, reply through the Contact page and tell us your account email.")
              : p("An administrator has restored your account. You can sign in again.")),
          suspended ? "Contact us" : "Sign in",
          suspended ? `${url}/contact` : `${url}/login`
        ),
        text: suspended
          ? `Your account is suspended.\n\nReason: ${d.reason}\n\nIf you think this is a mistake, contact us: ${url}/contact\n`
          : `Your account is active again. Sign in: ${url}/login\n`,
      };
    }

    case "pwd_verification": {
      // status: submitted | approved | rejected | revoked | reminder | expired
      const s = String(d.status || "");
      const page = `${url}/account/verification`;
      const hello = p(`Hello${d.name ? ` ${esc(d.name)}` : ""}.`);
      const copy: Record<string, { subject: string; head: string; lines: string[]; cta: string }> = {
        submitted: {
          subject: "We received your PWD ID — InclusiveMarket",
          head: "We received your PWD ID",
          lines: [
            `Our team at AVRC Region IX will review it within about ${esc(d.reviewDays || 2)} business days.`,
            "We will email you when we have decided. You do not need to do anything else for now.",
          ],
          cta: "View my verification",
        },
        approved: {
          subject: "You are verified — InclusiveMarket",
          head: "Your PWD ID is verified",
          lines: [
            d.expiresOn ? `Your verification is valid until <strong>${esc(d.expiresOn)}</strong>.` : "Your verification is now active.",
            d.role === "seller"
              ? "Your listings can now appear in the shop with a Verified PWD seller badge."
              : "You can now get PWD discounts on items where one applies.",
            "We delete the photos of your ID after review, as we told you when you sent them.",
          ],
          cta: "View my verification",
        },
        rejected: {
          subject: "We could not verify your PWD ID — InclusiveMarket",
          head: "We could not verify your PWD ID",
          lines: [
            `Reason: <strong>${esc(d.reason)}</strong>`,
            ...(d.note ? [esc(d.note)] : []),
            "You can send your ID again from your account. Clear, well-lit photos help us decide quickly.",
          ],
          cta: "Send my ID again",
        },
        revoked: {
          subject: "Your PWD verification was withdrawn — InclusiveMarket",
          head: "Your PWD verification was withdrawn",
          lines: [
            `Reason: <strong>${esc(d.reason)}</strong>`,
            "If you think this is a mistake, reply through the Contact page. You can also send your ID again.",
          ],
          cta: "View my verification",
        },
        reminder: {
          subject: "Your PWD ID expires soon — InclusiveMarket",
          head: "Your PWD ID expires soon",
          lines: [
            `Your verified PWD ID expires on <strong>${esc(d.expiresOn)}</strong> (in ${esc(d.days)} days).`,
            "Renew it at your city or municipal PDAO, then send us the new ID so you stay verified.",
          ],
          cta: "Send my renewed ID",
        },
        expired: {
          subject: "Your PWD verification has expired — InclusiveMarket",
          head: "Your PWD verification has expired",
          lines: ["Your PWD ID has passed its expiry date. Send us your renewed ID to be verified again."],
          cta: "Send my renewed ID",
        },
      };
      const c = copy[s] ?? copy.submitted;
      const strip = (h: string) => h.replace(/<[^>]+>/g, "");
      return {
        subject: c.subject,
        html: shell(c.head, hello + c.lines.map((l) => p(l)).join(""), c.cta, page),
        text: `${c.head}\n\n` + c.lines.map(strip).join("\n") + `\n\n${c.cta}: ${page}\n`,
      };
    }

    case "signup_confirm": {
      const code = String(d.code || "").trim();
      const codeBlock = code
        ? p("Or enter this confirmation code on the sign-in page:") +
          `<p style="margin:0 0 16px;font-size:28px;letter-spacing:.18em;font-weight:800;font-family:ui-monospace,Menlo,Consolas,monospace;color:${BRAND_DEEP}">${esc(code)}</p>`
        : "";
      return {
        subject: "Confirm your InclusiveMarket account",
        html: shell(
          "Confirm your email",
          p(`Hello${d.name ? ` ${esc(d.name)}` : ""}.`) +
            p("Welcome to InclusiveMarket. Confirm your email to finish creating your account.") +
            codeBlock,
          "Confirm my email",
          String(d.confirmUrl || url)
        ),
        text:
          `Confirm your InclusiveMarket account\n\n` +
          `Hello${d.name ? ` ${d.name}` : ""}.\n` +
          `Confirm your email to finish creating your account.\n\n` +
          (code ? `Confirmation code: ${code}\n\n` : "") +
          `Confirm: ${d.confirmUrl || url}\n`,
      };
    }

    case "password_reset": {
      const code = String(d.code || "").trim();
      const codeBlock = code
        ? p("Or type this code on the reset page (it expires in one hour):") +
          `<p style="margin:0 0 16px;font-size:28px;letter-spacing:.18em;font-weight:800;font-family:ui-monospace,Menlo,Consolas,monospace;color:${BRAND_DEEP}">${esc(code)}</p>`
        : "";
      return {
        subject: "Reset your InclusiveMarket password",
        html: shell(
          "Reset your password",
          p("We received a request to reset your password.") +
            p("Use the button below, or enter the code on the reset page. If you did not ask for this, you can ignore this email.") +
            codeBlock,
          "Reset password",
          String(d.confirmUrl || url)
        ),
        text:
          `Reset your InclusiveMarket password\n\n` +
          `We received a request to reset your password.\n` +
          (code ? `Reset code: ${code}\n\n` : "") +
          `Reset: ${d.confirmUrl || url}\n\n` +
          `If you did not ask for this, you can ignore this email.\n`,
      };
    }
  }
}
