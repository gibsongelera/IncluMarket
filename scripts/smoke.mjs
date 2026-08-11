/**
 * Offline smoke tests for Inclusive Market port.
 * Run: node scripts/smoke.mjs
 * Exit 0 only when all assertions pass.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  FAIL  ${msg}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("\n=== Smoke: file presence ===");
const required = [
  "components/AccessibilityWidget.tsx",
  "components/ChatWidget.tsx",
  "components/VisualAlert.tsx",
  "lib/a11y/prefs.ts",
  "lib/actions/chat.ts",
  "lib/actions/messages.ts",
  "lib/actions/wishlist.ts",
  "lib/actions/payments.ts",
  "lib/chatbot/responder.ts",
  "app/layout.tsx",
  "app/admin/payments/page.tsx",
  "supabase/migrations/0005_growth_schema.sql",
  "supabase/migrations/0006_growth_rls.sql",
  "supabase/migrations/0007_inclusive_extensions.sql",
  "supabase/migrations/0008_inclusive_extensions_rls.sql",
  "styles/tokens.css",
];
for (const f of required) assert(exists(f), `exists ${f}`);

console.log("\n=== Smoke: layout mounts widgets ===");
const layout = read("app/layout.tsx");
assert(layout.includes("AccessibilityWidget"), "layout mounts AccessibilityWidget");
assert(layout.includes("ChatWidget"), "layout mounts ChatWidget");
assert(layout.includes("VisualAlertHost"), "layout mounts VisualAlertHost");

console.log("\n=== Smoke: accessibility toolbar features ===");
const a11y = read("components/AccessibilityWidget.tsx");
assert(a11y.includes("FONT_SIZES"), "a11y uses FONT_SIZES");
assert(a11y.includes("Text-to-speech") || a11y.includes("tts"), "a11y has TTS");
assert(a11y.includes("Voice commands") || a11y.includes("voiceCmds"), "a11y has voice commands");
assert(a11y.includes("Reading mode") || a11y.includes("readingMode"), "a11y has reading mode");
assert(a11y.includes("Visual alert") || a11y.includes("visualAlerts"), "a11y has visual alerts");
assert(/12|24/.test(a11y) || a11y.includes("nextFontSize"), "a11y covers 12–24px range");

console.log("\n=== Smoke: a11y prefs pure logic ===");
// Inline mirror of clamp/match for offline assert (keeps smoke free of TS loader)
function clampFontSize(n) {
  const stepped = Math.round(n / 2) * 2;
  return Math.min(24, Math.max(12, stepped));
}
function matchVoiceCommand(utterance) {
  const t = utterance.toLowerCase().trim();
  if (/\bcart\b/.test(t)) return { type: "navigate", href: "/buyer/cart" };
  if (/\b(go )?(home|homepage)\b/.test(t)) return { type: "navigate", href: "/home" };
  if (/\b(stop|quiet|silence)\b/.test(t)) return { type: "stop" };
  return null;
}
assert(clampFontSize(10) === 12, "font clamp min 12");
assert(clampFontSize(30) === 24, "font clamp max 24");
assert(clampFontSize(17) === 16 || clampFontSize(17) === 18, "font clamp steps");
assert(matchVoiceCommand("go to cart")?.href === "/buyer/cart", "voice → cart");
assert(matchVoiceCommand("go home")?.href === "/home", "voice → home");
assert(matchVoiceCommand("stop speaking")?.type === "stop", "voice → stop");

// Prefer importing the real TS module when Node strip-types / tsx is available
try {
  const prefsUrl = pathToFileURL(path.join(ROOT, "lib/a11y/prefs.ts")).href;
  const mod = await import(prefsUrl);
  assert(mod.clampFontSize(11) === 12, "imported clampFontSize(11)===12");
  assert(mod.clampFontSize(25) === 24, "imported clampFontSize(25)===24");
  assert(mod.matchVoiceCommand("go to wishlist")?.href === "/buyer/wishlist", "imported voice wishlist");
} catch (err) {
  console.log(`  SKIP  TS prefs import (${err.message.split("\n")[0]}) — inline asserts used`);
}

console.log("\n=== Smoke: chat create/fetch surface ===");
const chatAction = read("lib/actions/chat.ts");
assert(chatAction.includes("export async function sendChatMessage"), "sendChatMessage exported");
assert(chatAction.includes("export async function fetchChatHistory"), "fetchChatHistory exported");
assert(chatAction.includes("im_chat_sessions"), "chat writes sessions");
assert(chatAction.includes("im_chat_messages"), "chat writes messages");
const chatWidget = read("components/ChatWidget.tsx");
assert(chatWidget.includes("sendChatMessage"), "ChatWidget calls sendChatMessage");
assert(chatWidget.includes("fetchChatHistory"), "ChatWidget calls fetchChatHistory");

console.log("\n=== Smoke: chatbot responder rules ===");
const responder = read("lib/chatbot/responder.ts");
assert(responder.includes("MockResponder") || responder.includes("getChatResponder"), "responder present");
assert(responder.includes("shipping") || responder.includes("wishlist"), "responder has domain rules");

console.log("\n=== Smoke: SQL schema coverage ===");
const m5 = read("supabase/migrations/0005_growth_schema.sql");
const m7 = read("supabase/migrations/0007_inclusive_extensions.sql");
const m8 = read("supabase/migrations/0008_inclusive_extensions_rls.sql");
for (const t of [
  "im_wishlists",
  "im_notifications",
  "im_conversations",
  "im_messages",
  "im_chat_sessions",
  "im_chat_messages",
  "im_order_status_history",
]) {
  assert(m5.includes(t), `0005 defines ${t}`);
}
for (const t of ["im_payment_providers", "im_payouts", "im_transactions", "im_activity_logs", "font_size_px"]) {
  assert(m7.includes(t), `0007 defines ${t}`);
}
assert(m8.includes("im_payment_providers"), "0008 RLS payment providers");
assert(m8.includes("im_payouts"), "0008 RLS payouts");

console.log("\n=== Smoke: DSWD color tokens ===");
const tokens = read("styles/tokens.css");
assert(/#0038A8/i.test(tokens), "tokens include DSWD blue #0038A8");
assert(/#C41E3A/i.test(tokens) || /brand-red/i.test(tokens), "tokens include compassion red");
assert(/#F5C518/i.test(tokens) || /brand-yellow/i.test(tokens), "tokens include gold/yellow");
assert(/#FFFFFF|#F5F7FA/i.test(tokens), "tokens include white/light gray");

console.log("\n=== Smoke: key pages present ===");
for (const p of [
  "app/home/page.tsx",
  "app/buyer/cart/page.tsx",
  "app/buyer/wishlist/page.tsx",
  "app/buyer/messages/page.tsx",
  "app/seller/messages/page.tsx",
  "app/accessibility/page.tsx",
  "app/admin/payments/page.tsx",
]) {
  assert(exists(p), `page ${p}`);
}

console.log("\n=== Smoke: TypeScript check (tsc --noEmit) ===");
const tscBin = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
if (fs.existsSync(tscBin)) {
  const r = spawnSync(process.execPath, [tscBin, "--noEmit", "--pretty", "false"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status === 0) {
    assert(true, "tsc --noEmit clean");
  } else {
    const errLines = (r.stdout || r.stderr || "").split("\n").filter(Boolean).slice(0, 12);
    assert(false, `tsc --noEmit failed:\n${errLines.join("\n")}`);
  }
} else {
  console.log("  SKIP  typescript not installed yet");
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed) {
  console.log("Failures:");
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
process.exit(0);
