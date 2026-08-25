import "server-only";
import type { ChatMessage, ChatReply, ChatResponder } from "./responder";
import type { ChatContext } from "./context";
import { buildSystemPrompt, PROMPT_FINGERPRINT } from "./system-prompt";

/**
 * OpenRouter-backed chat responder.
 *
 * Selected by CHAT_PROVIDER=openrouter. Server-side only — the API key must
 * never reach the browser, enforced by the `server-only` import above plus the
 * fact this is reached only from a "use server" action.
 *
 * The live data the model answers from is assembled per request by
 * lib/chatbot/context.ts and scoped to the caller's role, so the model is
 * physically incapable of describing another user's records: they are not in
 * the prompt.
 *
 * Non-streaming, deliberately. The contract is a single awaited string
 * persisted as one im_chat_messages row; streaming would mean a Route Handler
 * with a ReadableStream, a client reader and partial-message persistence. It
 * would also be worse here: a screen reader announcing an aria-live region
 * that mutates token-by-token is much harder to follow than one complete
 * announcement.
 *
 * Every failure path falls back to the rule-based responder, which reads the
 * same context — so a provider outage degrades to shorter answers, not to no
 * answers.
 */

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const HISTORY_TURNS = 8;
/** OpenRouter rejects a fallback array longer than this with a 400. */
const MAX_FALLBACK_MODELS = 3;
const MAX_TURN_CHARS = 500;

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export class OpenRouterResponder implements ChatResponder {
  constructor(private readonly fallback: ChatResponder) {}

  async respond(
    history: ChatMessage[],
    userMessage: string,
    context: ChatContext
  ): Promise<ChatReply> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return this.fallback.respond(history, userMessage, context);

    // OPENROUTER_MODEL may be a comma-separated chain. Free models share one
    // upstream pool and return 429 whenever it is saturated, which has nothing
    // to do with your key — so naming more than one lets OpenRouter route to
    // the next available instead of failing the turn.
    // Capped at MAX_FALLBACK_MODELS: OpenRouter rejects a longer `models` array
    // outright ("'models' array must have 3 items or fewer", HTTP 400), which
    // would fail EVERY request rather than degrading — the opposite of what a
    // fallback chain is for. Extra entries in the env are ignored, not fatal.
    const models = (process.env.OPENROUTER_MODEL || DEFAULT_MODEL)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, MAX_FALLBACK_MODELS);
    const model = models[0] || DEFAULT_MODEL;
    const maxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 400);
    const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 8000);

    // User text stays in `user` role messages and is never concatenated into
    // the system message — that separation is what makes the model treat it as
    // data rather than instruction.
    const messages = [
      { role: "system" as const, content: buildSystemPrompt(context) },
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
          // OpenRouter's own fallback routing: it walks this list and uses the
          // first model that is actually available. Only sent when a chain is
          // configured, so a single-model setup behaves exactly as before.
          ...(models.length > 1 ? { models } : {}),
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");

        // 429 is worth distinguishing. It is not a broken configuration: the
        // free-model pool is shared and saturates, so the same setup works
        // minutes later. Saying so stops it being mistaken for a dead model id.
        if (res.status === 429) {
          console.warn(
            `[openrouter] rate-limited upstream (429) on "${models.join(", ")}". ` +
              "This is the shared free-tier pool, not your key. Answering from the " +
              "rule-based responder. Add more models to OPENROUTER_MODEL " +
              "(comma-separated) so OpenRouter can route around it."
          );
        } else {
          // 400/404 usually means the model id was renamed or retired — log the
          // id so it is obvious what to change in the environment.
          console.error(
            `[openrouter] HTTP ${res.status} for model "${model}": ${detail.slice(0, 200)}`
          );
        }
        return this.fallback.respond(history, userMessage, context);
      }

      const json = (await res.json()) as OpenRouterResponse;
      const raw = json.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== "string") {
        console.error("[openrouter] empty completion", json.error?.message ?? "");
        return this.fallback.respond(history, userMessage, context);
      }

      const clean = sanitizeReply(raw, context);
      if (!clean) return this.fallback.respond(history, userMessage, context);

      return { reply: clean };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[openrouter] request failed for model "${model}":`, message);
      return this.fallback.respond(history, userMessage, context);
    }
  }
}

/**
 * Post-filter the model output.
 *
 * Structural defence, not cosmetics: a model can be talked into echoing its
 * instructions or emitting an off-site link, and this chat is reachable
 * anonymously, so the cost of that is a phishing link in a stranger's window.
 * Returns an empty string when the reply should be discarded in favour of the
 * rule-based responder.
 */
function discard(reason: string, sample: string): string {
  console.warn(
    `[openrouter] reply discarded (${reason}); answering from the rule-based ` +
      `responder instead. Model said: ${JSON.stringify(sample.slice(0, 140))}`
  );
  return "";
}

export function sanitizeReply(raw: string, context?: ChatContext): string {
  let text = raw.trim();

  // Reasoning models wrap their scratchpad in tags. Drop those outright — what
  // follows is the actual answer.
  text = text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<\|?(?:begin_of_thought|reasoning)\|?>[\s\S]*?<\|?(?:end_of_thought|\/reasoning)\|?>/gi, "")
    .trim();

  // Strip a leading role label if the model imitates the transcript format.
  text = text.replace(/^(system|assistant|ai|bot)\s*:\s*/i, "");

  // Untagged chain-of-thought. Observed in practice: a reply that opened
  // "Here's a thinking process: 1. **Analyze User Input:** ..." and then
  // quoted the system prompt and the live context back at the visitor.
  //
  // Discard rather than try to extract the answer buried inside it: a botched
  // extraction still leaks, and the rule-based fallback gives a correct short
  // answer instead. Better a plain answer than a transcript of the model
  // reasoning about its own instructions.
  if (
    /here(?:'s| is)\s+(?:a\s+|my\s+)?(?:thinking|thought)\s+process|^\s*\*\*\s*analy|let me (?:think|analyz)|i (?:need|have) to (?:answer|respond|be careful|check the)/i.test(
      text
    )
  ) {
    return discard("chain of thought", text);
  }

  // Refuse anything that looks like the prompt coming back out.
  if (text.toLowerCase().includes(PROMPT_FINGERPRINT.toLowerCase()))
    return discard("echoed the system prompt", text);
  if (/RULES YOU MUST FOLLOW|HOW TO ANSWER|WHO YOU ARE TALKING TO|END CONTEXT/i.test(text)) {
    return discard("quoted a prompt heading", text);
  }

  // The same leak PARAPHRASED. The checks above only catch verbatim
  // reproduction, and a model that reformats — "VISITOR CONTEXT:" with a colon
  // where the prompt has a newline, "Rules:" instead of "RULES YOU MUST
  // FOLLOW" — slipped straight through them. Match on the model TALKING ABOUT
  // its instructions, not on the exact bytes.
  if (
    /\b(?:system prompt|context block|my instructions|the instructions (?:say|state)|the rules (?:say|state)|(?:visitor|buyer|seller|admin) context)\b/i.test(
      text
    )
  ) {
    return discard("described its instructions", text);
  }

  // Or the live data block verbatim.
  if (context && text.includes(context.summary.slice(0, 40)))
    return discard("echoed the live context", text);

  // A reply that claims a completed state change is worse than an unhelpful
  // one: a buyer who believes their order was cancelled acts on it. The system
  // prompt forbids this, but the perfect tense is a narrow, reliable signal, so
  // it is also enforced here. "I cannot cancel" and "you can cancel" do not
  // match — only a first-person claim that it is already done.
  if (
    /\bI(?:'ve| have)\s+(?:cancelled|canceled|refunded|shipped|approved|rejected|deleted|processed|updated|issued)\b/i.test(
      text
    )
  ) {
    return discard("claimed a completed action", text);
  }

  // Drop links to anywhere that is not this site.
  //
  // The allow-list is built from every origin this app answers on, not just
  // OPENROUTER_SITE_URL — that variable is optional, and when it was unset the
  // host comparison matched nothing, so the bot silently stripped links to its
  // OWN pages. Pointing people at the right page is most of what it does.
  const allowedHosts = new Set<string>(["inclumarket.vercel.app"]);
  for (const candidate of [process.env.OPENROUTER_SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!candidate) continue;
    try {
      allowedHosts.add(new URL(candidate).host);
    } catch {
      /* ignore an unparseable value */
    }
  }

  text = text.replace(/https?:\/\/[^\s)>\]]+/gi, (url) => {
    try {
      const { host, hostname } = new URL(url);
      if (allowedHosts.has(host)) return url;
      // Local development, where the port varies.
      if (hostname === "localhost" || hostname === "127.0.0.1") return url;
    } catch {
      /* fall through */
    }
    return "[link removed]";
  });

  // Keep replies short enough to be read aloud comfortably.
  if (text.length > 1200) text = `${text.slice(0, 1200).trimEnd()}…`;

  return text.trim();
}
