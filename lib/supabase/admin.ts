import "server-only";
import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY admin client. Uses the service-role key, which BYPASSES RLS.
// The `server-only` import above makes the build fail if this module is ever
// imported into a Client Component, guaranteeing the key never reaches the
// browser bundle. Only use inside server actions / route handlers after an
// explicit role check.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only).");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
