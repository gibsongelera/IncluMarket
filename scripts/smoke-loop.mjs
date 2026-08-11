/**
 * Re-run smoke tests until pass or max attempts.
 * Usage: node scripts/smoke-loop.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX = Number(process.env.SMOKE_MAX || 5);

let attempt = 0;
while (attempt < MAX) {
  attempt++;
  console.log(`\n######## Smoke loop attempt ${attempt}/${MAX} ########`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "smoke.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status === 0) {
    console.log(`\nSmoke PASSED on attempt ${attempt}`);
    process.exit(0);
  }
  console.log(`\nSmoke FAILED on attempt ${attempt} (exit ${r.status})`);
}

console.error(`\nSmoke still failing after ${MAX} attempts`);
process.exit(1);
