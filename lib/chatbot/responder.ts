import "server-only";

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
 * Provider selection for the chat widget. Defaults to the rule-based mock
 * responder above. To go live with a real LLM: implement a ChatResponder
 * (e.g. `class OpenAIResponder implements ChatResponder`) reading its API
 * key from a server-only env var, add a case below keyed off CHAT_PROVIDER,
 * and set that env var. No changes needed anywhere else — the widget UI and
 * lib/actions/chat.ts only ever call getChatResponder().respond(...).
 */
export function getChatResponder(): ChatResponder {
  const provider = process.env.CHAT_PROVIDER;
  switch (provider) {
    default:
      return new MockResponder();
  }
}
