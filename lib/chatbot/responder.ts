import "server-only";
import { OpenRouterResponder } from "./openrouter";
import { money } from "@/lib/format";
import type { ChatContext } from "./context";

export interface ChatMessage {
  role: "user" | "bot" | "system";
  body: string;
}

export interface ChatReply {
  reply: string;
  escalate?: boolean;
}

export interface ChatResponder {
  respond(
    history: ChatMessage[],
    userMessage: string,
    context: ChatContext
  ): Promise<ChatReply>;
}

const ESCALATE_PATTERN = /\b(human|agent|person|representative|someone|staff)\b/i;

/** Static help, used when no live figure answers the question. */
const RULES: { keywords: string[]; reply: string }[] = [
  {
    keywords: ["return", "refund", "exchange"],
    reply:
      "For returns or refunds, message the seller directly from the product page, or open a support ticket. Say \"talk to a human\" if you need our team involved.",
  },
  {
    keywords: ["accessib", "screen reader", "keyboard", "contrast", "disab", "font size", "voice"],
    reply:
      "Open the accessibility button in the corner of any page. It has text size from 12 to 24 pixels, high contrast, reduced motion, a larger cursor, text-to-speech, voice commands, reading mode and visual alerts.",
  },
  {
    keywords: ["pay", "gcash", "maya", "grabpay", "card", "checkout", "cod", "cash on delivery"],
    reply:
      "At checkout you can pay cash on delivery, or pay online with GCash, Maya, GrabPay or a card. Online payments go through PayMongo's secure page — we never see your card details.",
  },
  {
    keywords: ["seller", "sell", "pwd", "become a seller"],
    reply:
      "Every seller on IncluMarket is a person with a disability running their own livelihood. To sell, sign up with a seller account; listings are reviewed before they go live.",
  },
  {
    keywords: ["wishlist", "save item", "heart"],
    reply: "Tap the heart on any product to save it to your Wishlist, in the main navigation.",
  },
  {
    keywords: ["message seller", "contact seller"],
    reply: "Open any product page and tap \"Message seller\" to start a direct conversation.",
  },
];

/**
 * Rule-based responder, used when no LLM is configured AND as the fallback for
 * the LLM path.
 *
 * Unlike the original version this is no longer purely canned: it answers from
 * the live, role-scoped ChatContext where it can. "Where is my order" gets the
 * caller's actual most recent order and its real status, not a description of
 * where to look for it.
 */
export class RuleResponder implements ChatResponder {
  async respond(
    _history: ChatMessage[],
    userMessage: string,
    context: ChatContext
  ): Promise<ChatReply> {
    const text = userMessage.toLowerCase();

    if (ESCALATE_PATTERN.test(text)) {
      return {
        reply: "Connecting you with our support team — they will see this whole conversation.",
        escalate: true,
      };
    }

    const live = answerFromContext(text, context);
    if (live) return { reply: live };

    for (const rule of RULES) {
      if (rule.keywords.some((k) => text.includes(k))) return { reply: rule.reply };
    }

    return { reply: fallbackFor(context) };
  }
}

/**
 * Answer directly from the live context when the question is about a figure we
 * actually hold. Returns null when nothing in the context applies, so the
 * caller can fall through to static help.
 */
function answerFromContext(text: string, context: ChatContext): string | null {
  const f = context.facts;

  if (context.audience === "guest") {
    if (/\bmy (orders?|carts?|wishlists?|account)\b|\bwhere (is|are) my\b|\btrack(ing)?\b/.test(text)) {
      return "You are not signed in, so I cannot see your account. Please sign in and I can tell you your order status right here.";
    }
    return null;
  }

  // ---- buyer -------------------------------------------------------------
  if (context.audience === "buyer") {
    if (/\borders?\b|\bwhere (is|are)\b|\btrack(ing)?\b|\bdeliver/.test(text)) {
      if (!f.orders?.length) {
        return "You have not placed any orders yet. When you do, they will appear in My Orders with a full status timeline.";
      }
      const latest = f.orders[0];
      const rest =
        f.orders.length > 1
          ? ` You have ${f.orders.length} recent orders in total — see My Orders for the rest.`
          : "";
      return `Your most recent order is #${latest.id}, placed ${latest.placed}. It is currently "${latest.status}" and the payment is "${latest.paymentStatus}". Total ${money(latest.total)}.${rest}`;
    }

    if (/\bcarts?\b|\bbaskets?\b/.test(text)) {
      return f.cartCount
        ? `You have ${f.cartCount} item${f.cartCount === 1 ? "" : "s"} in your cart. Open Cart to check out.`
        : "Your cart is empty right now. Browse the shop and tap Add to cart on anything you like.";
    }

    if (/\bwishlists?\b|\bsaved\b|\bfavourite|\bfavorite/.test(text)) {
      return f.wishlistCount
        ? `You have ${f.wishlistCount} item${f.wishlistCount === 1 ? "" : "s"} saved in your Wishlist.`
        : "Your Wishlist is empty. Tap the heart on any product to save it.";
    }

    if (/\btickets?\b|\bsupport\b|\bcomplain/.test(text)) {
      return f.openTickets
        ? `You have ${f.openTickets} unresolved support ticket${f.openTickets === 1 ? "" : "s"}. You can follow ${f.openTickets === 1 ? "it" : "them"} on the Support page.`
        : "You have no open support tickets. You can raise one from the Support page any time.";
    }

    // Out-of-scope guard, checked last so the branches above still win.
    // Without it, "how many sellers are on the platform" fell through to the
    // static keyword rules and produced a pitch about becoming a seller —
    // no data leaked, but a confusing non-answer.
    if (
      /\bhow many\b|\bplatform\b|\beveryone\b|\ball (users?|sellers?|buyers?)\b|\binventory\b|\bstocks?\b|\brevenue\b/.test(
        text
      )
    ) {
      return "I can only see your own account here — your orders, cart, wishlist and support tickets. I do not have platform-wide figures or anyone else's information.";
    }
    return null;
  }

  // ---- seller ------------------------------------------------------------
  if (context.audience === "seller") {
    if (/\bstocks?\b|\binventory\b|\brestock\b|\blow\b/.test(text)) {
      if (!f.lowStock?.length) {
        return "None of your products are low on stock right now. I will flag anything at or below 5 units.";
      }
      const list = f.lowStock.map((p) => `${p.title} (${p.stock} left)`).join(", ");
      return `${f.lowStock.length} of your products ${f.lowStock.length === 1 ? "is" : "are"} low on stock: ${list}. Restock them from My Products.`;
    }

    if (/\borders?\b|\bfulfil|\bfulfill|\bship(ping|ments?)?\b|\bpending\b/.test(text)) {
      return f.pendingOrders
        ? `You have ${f.pendingOrders} order${f.pendingOrders === 1 ? "" : "s"} awaiting fulfilment. Open Orders to advance ${f.pendingOrders === 1 ? "it" : "them"}.`
        : "You have no orders awaiting fulfilment right now.";
    }

    if (/\bproducts?\b|\blistings?\b|\bapprov|\bpending\b/.test(text)) {
      if (!f.products?.length) {
        return "You have not listed any products yet. Add your first one from My Products — listings are reviewed before they go live.";
      }
      const pending = f.products.filter((p) => p.status === "pending");
      const live = f.products.filter((p) => p.status === "approved");
      return `You have ${f.products.length} product${f.products.length === 1 ? "" : "s"}: ${live.length} live and ${pending.length} awaiting review. Manage them from My Products.`;
    }

    if (/\bratings?\b|\breviews?\b|\bscores?\b|\bfeedback\b/.test(text)) {
      return f.averageRating
        ? `Your products average ${f.averageRating} out of 5 across all reviews. You can read them on the Reviews page.`
        : "You have no reviews yet. They will appear on the Reviews page as buyers leave them.";
    }

    // Out-of-scope guard, same reasoning as the buyer branch.
    if (
      /\bhow many (users?|buyers?|members?)\b|\bplatform\b|\banother sellers?\b|\bother sellers?\b|\ball sellers?\b|\bcompetitor/.test(
        text
      )
    ) {
      return "I can only see your own shop here — your products, stock, orders and reviews. I do not have platform-wide figures or any other seller's information.";
    }
    return null;
  }

  // ---- admin -------------------------------------------------------------
  const p = f.platform;
  if (!p) return null;

  // Checked FIRST. An admin is allowed to see personal data in the dashboard,
  // where access is role-checked and audit-logged — but not through a chat
  // widget, which is neither. Under RA 10173 disability information and
  // contact details are sensitive personal information, so the bot declines
  // and points at the surface that does log the access.
  if (/\bemail|\bphone\b|\baddress\b|\bcontact detail|\bdisabilit|\bpwd id\b|\bpersonal data\b/.test(text)) {
    return "I cannot show personal details such as email addresses, phone numbers or disability information — those are sensitive personal data under RA 10173, and I am not an audited surface for them. Open Users in the dashboard, where access is role-checked and logged.";
  }

  if (/\bapprov|\bpending\b|\bqueue\b|\breviews?\b/.test(text)) {
    return p.pendingProducts
      ? `${p.pendingProducts} product${p.pendingProducts === 1 ? " is" : "s are"} awaiting review. Open Products to approve or flag ${p.pendingProducts === 1 ? "it" : "them"}.`
      : "Nothing is waiting for product review right now.";
  }

  if (/\btickets?\b|\bsupport\b/.test(text)) {
    return p.openTickets
      ? `${p.openTickets} support ticket${p.openTickets === 1 ? " is" : "s are"} unresolved. Open Tickets to work through ${p.openTickets === 1 ? "it" : "them"}.`
      : "There are no unresolved support tickets.";
  }

  if (/\busers?\b|\bsellers?\b|\bbuyers?\b|\bmembers?\b|\bsignup|\bregist/.test(text)) {
    return `There are ${p.sellers} seller${p.sellers === 1 ? "" : "s"} and ${p.buyers} buyer${p.buyers === 1 ? "" : "s"} registered. Open Users to manage accounts — I cannot show individual records here.`;
  }

  if (/\borders?\b|\bsales?\b|\brevenue\b|\btoday\b/.test(text)) {
    return `${p.ordersToday} order${p.ordersToday === 1 ? " was" : "s were"} placed in the last 24 hours. Reports has the full breakdown and the Excel export.`;
  }

  return null;
}

function fallbackFor(context: ChatContext): string {
  switch (context.audience) {
    case "buyer":
      return 'I can help with your orders, cart, wishlist, payments, returns and accessibility. Ask me about any of those, or say "talk to a human".';
    case "seller":
      return 'I can help with your products, stock, orders awaiting fulfilment, reviews and how listing approval works. Ask me about any of those, or say "talk to a human".';
    case "admin":
      return 'I can report pending approvals, unresolved tickets, user counts and recent order volume. For individual records, use the dashboard pages. Say "talk to a human" for our team.';
    default:
      return 'I can help with how IncluMarket works, accessibility features, payments and selling here. Sign in and I can also look up your own orders. Say "talk to a human" to reach our support team.';
  }
}

/**
 * Provider selection.
 *
 * Unset CHAT_PROVIDER keeps the rule-based responder: no API key, no network
 * call, no cost — and, now that it reads the live context, it still answers
 * real questions with real figures. CHAT_PROVIDER=openrouter switches to the
 * LLM, which wraps this responder as its fallback, so a missing key, retired
 * model, timeout or filtered reply degrades to the rules rather than to an
 * error.
 */
export function getChatResponder(): ChatResponder {
  const rules = new RuleResponder();
  switch (process.env.CHAT_PROVIDER) {
    case "openrouter": {
      if (!process.env.OPENROUTER_API_KEY) {
        console.warn("[chat] CHAT_PROVIDER=openrouter but OPENROUTER_API_KEY is unset.");
        return rules;
      }
      return new OpenRouterResponder(rules);
    }
    default:
      return rules;
  }
}
