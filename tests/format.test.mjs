// Tests run on Node's built-in runner (node --test). Node strips TypeScript
// types on import, so pure modules under lib/ are imported directly by their
// .ts path. A module tested here must not import anything at runtime except
// other pure modules: `import type` is fine (it is erased), but `@/` aliases,
// "server-only" and supabase are not resolvable outside Next.
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, initials } from "../lib/format.ts";

test("maskEmail keeps first/last letter and the TLD", () => {
  assert.equal(maskEmail("juana@mail.ph"), "j***a@m***.ph");
  assert.equal(maskEmail("ab@x.com"), "a*@x*.com");
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});

test("initials takes at most two words", () => {
  assert.equal(initials("Maria Clara Santos"), "MC");
  assert.equal(initials("ana"), "A");
});
