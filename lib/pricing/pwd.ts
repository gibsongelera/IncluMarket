import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { PwdContext } from "./core";

type Db = ReturnType<typeof createAdminClient>;

/**
 * PWD discount context for a buyer: their approved, unexpired verification
 * and the discount rules that are switched on.
 *
 * Returns null — no discount anywhere — until the verification and discount
 * tables exist and a rule has been enabled with legal sign-off (plan steps S4
 * and S5-14). Every rule ships disabled.
 */
export async function loadPwdContext(_db: Db, _buyerId: number): Promise<PwdContext | null> {
  return null;
}
