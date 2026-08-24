import "server-only";
import type { ChatMessage, ChatReply, ChatResponder } from "./responder";
import { SYSTEM_PROMPT } from "./system-prompt";

/**
 * OpenRouter-backed chat responder.
 *
 * Selected by CHAT_PROVIDER=openrouter. Server-side only — the API key must
 * never reach the browser, which is enforced by the `server-only` import above
 * plus the fact that this is only ever reached from a "use server" action.
 *
 * Non-streaming, deliberately. The existing contract is a single awaited
 * string that gets persisted as one im_chat_messages row; streaming would mean
 * converting the chat to a Route Handler with a ReadableStream, a client-side
 * reader, and a partial-message persistence strategy. It would also be worse
 * for this audience: a screen reader announcing an aria-live region that
 * mutates token-by-token is far harder to follow than one complete
 * announcement.
 *
 * Every failure path falls back to the rule-based responder, so the widget
 * never shows a broken state.
 */

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** The model the user asked for; overridable because free-tier ids churn. */
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

/** How many prior turns to send. The action used to fetch the whole session. */
const HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 500;

interface OpenRouterChoice {
  message?: { content?: string };
}
interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string };
}

export class OpenRouterResponder implements ChatResponder {
  constructor(private readonly fallback: ChatResponder) {}

  async respond(history: ChatMessage[], userMessage: string): Promise<ChatReply> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return this.fallback.respond(history, userMessage);

    const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const maxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 400);
    const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 8000);

    // User text stays in `user` role messages and is never concatenated into
    // the system message — that separation is what makes the model treat it as
    // data rather than instruction.
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.slice(-HISTORY_TURNS).map((m) => ({
        role: m.role === "bot" ? ("assistant" as const) : ("user" as const),
        content: String(m.body ?? "").slice(0, MAX_TURN_CHARS),
      })),
      { role: "user" as const, content: userMessage.slice(0, MAX_TURN_CHARS) },
    ];

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          // OpenRouter uses these for attribution and free-tier allocation.
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_NAME || "IncluMarket",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        // 400/404 here usually means the model id was renamed or retired —
        // log the id so it is obvious what to change in the environment.
        const detail = await res.text().catch(() => "");
        console.error(
          `[openrouter] HTTP ${res.status} for model "${model}": ${detail.slice(0, 200)}`
        );
        return this.fallback.respond(history, userMessage);
      }

      const json = (await res.json()) as OpenRouterResponse;
      const raw = json.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== "string") {
        console.error("[openrouter] empty completion", json.error?.message ?? "");
        return this.fallback.respond(history, userMessage);
      }

      const clean = sanitizeReply(raw);
      if (!clean) return this.fallback.respond(history, userMessage);

      return { reply: clean };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[openrouter] request failed for model "${model}":`, message);
      return this.fallback.respond(history, userMessage);
    }
  }
}

/**
 * Post-filter the model output.
 *
 * Structural defence, not cosmetics: even a well-behaved model can be talked
 * into echoing its instructions or emitting an off-site link, and this chat is
 * unauthenticated so the cost of that is a phishing link in a stranger's chat
 * window. Returns an empty string when the reply should be discarded in favour
 * of the rule-based responder.
 */
export function sanitizeReply(raw: string): string {
  let text = raw.trim();

  // Strip a leading role label if the model imitates the transcript format.
  text = text.replace(/^(system|assistant|ai|bot)\s*:\s*/i, "");

  // Refuse anything that looks like the system prompt coming back out.
  const fingerprint = SYSTEM_PROMPT.slice(0, 60).toLowerCase();
  if (text.toLowerCase().includes(fingerprint)) return "";
  if (/RULES YOU MUST FOLLOW|HOW TO ANSWER|WHAT THE SITE CAN ACTUALLY DO/.test(text)) return "";

  // Drop links to anywhere that is not this site.
  const site = process.env.OPENROUTER_SITE_URL || "";
  let siteHost = "";
  try {
    siteHost = site ? new URL(site).host : "";
  } catch {
    siteHost = "";
  }
  text = text.replace(/https?:\/\/[^\s)>\]]+/gi, (url) => {
    try {
      const host = new URL(url).host;
      if (host === siteHost || host.endsWith("inclumarket.vercel.app")) return url;
    } catch {
      /* fall through */
    }
    return "[link removed]";
  });

  // Keep replies short enough to be read aloud comfortably.
  if (text.length > 1200) text = `${text.slice(0, 1200).trimEnd()}…`;

  return text.trim();
}
