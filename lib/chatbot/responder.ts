import "server-only";
import { OpenRouterResponder } from "./openrouter";

export interface ChatMessage {
  role: "user" | "bot" | "system";
  body: string;
}

export interface ChatReply {
  reply: string;
  escalate?: boolean;
}

export interface ChatResponder {
  respond(history: ChatMessage[], userMessage: string): Promise<ChatReply>;
}

const RULES: { keywords: string[]; reply: string }[] = [
  {
    keywords: ["shipping", "deliver", "delivery", "track", "tracking"],
    reply:
      "You can track any order from My Orders — every order shows a full status timeline (pending → processing → shipped → delivered), not just the current status.",
  },
  {
    keywords: ["return", "refund", "exchange"],
    reply:
      "For returns or refunds, message the seller directly from the product page, or ask them to mark the order \"returned\" once you've agreed. Ask me to \"talk to a human\" if you need our team involved.",
  },
  {
    keywords: ["accessib", "screen reader", "keyboard", "contrast", "disab"],
    reply:
      "IncluMarket targets WCAG 2.1 AA. Open the accessibility button (bottom-left) for font size 12–24px, high contrast, text-to-speech, voice commands, reading mode, and visual alert flashes. See our Accessibility Statement for the full list.",
  },
  {
    keywords: ["seller", "sell", "pwd", "featured"],
    reply:
      "Every seller on IncluMarket is a person with a disability running their own livelihood — see Featured PWD Sellers on the homepage. To sell, sign up with a seller account; listings are reviewed before going live.",
  },
  {
    keywords: ["wishlist", "save item", "heart icon"],
    reply: "Tap the heart icon on any product to save it to your Wishlist, in the main navigation.",
  },
  {
    keywords: ["flash sale", "discount", "sale"],
    reply:
      "Flash sales show up on the homepage with a discounted price — wishlist an item and you'll be notified the moment it goes on sale.",
  },
  {
    keywords: ["message seller", "contact seller"],
    reply: "Open any product page and tap \"Message seller\" to start a direct conversation with them.",
  },
];

const ESCALATE_PATTERN = /\b(human|agent|person|representative|someone)\b/i;

class MockResponder implements ChatResponder {
  async respond(_history: ChatMessage[], userMessage: string): Promise<ChatReply> {
    const text = userMessage.toLowerCase();

    if (ESCALATE_PATTERN.test(text)) {
      return {
        reply: "Connecting you with our support team — they'll see this whole conversation.",
        escalate: true,
      };
    }

    for (const rule of RULES) {
      if (rule.keywords.some((k) => text.includes(k))) {
        return { reply: rule.reply };
      }
    }

    return {
      reply:
        'I can help with orders, shipping, returns, accessibility, wishlist, flash sales, and selling on IncluMarket. Ask me about any of those, or say "talk to a human" to reach our support team.',
    };
  }
}

/**
 * Provider selection for the chat widget.
 *
 * Unset CHAT_PROVIDER (the default) keeps the rule-based responder above: no
 * API key, no network call, no cost. CHAT_PROVIDER=openrouter switches to the
 * LLM, which still wraps this responder as its fallback — so a missing key, a
 * retired model id, a timeout or a filtered reply degrades to the rules rather
 * than to an error message.
 *
 * The escalation check runs in MockResponder BEFORE any model call would
 * happen for that path, so "talk to a human" keeps working deterministically
 * even when the provider is down.
 */
export function getChatResponder(): ChatResponder {
  const mock = new MockResponder();
  switch (process.env.CHAT_PROVIDER) {
    case "openrouter": {
      if (!process.env.OPENROUTER_API_KEY) {
        console.warn("[chat] CHAT_PROVIDER=openrouter but OPENROUTER_API_KEY is unset.");
        return mock;
      }
      return new OpenRouterResponder(mock);
    }
    default:
      return mock;
  }
}
