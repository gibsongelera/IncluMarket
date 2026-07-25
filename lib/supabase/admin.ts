import "server-only";
import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY admin client. Uses the service-role key, which BYPASSES RLS.
// The `server-only` import above makes the build fail if this module is ever
// imported into a Client Component, guaranteeing the key never reaches the
// browser bundle. Only use inside server actions / route handlers after an
// explicit role check.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server-only). " +
        "Add both in Vercel → Project Settings → Environment Variables " +
        "(Production + Preview), then redeploy."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when the service-role client can be constructed (env present). */
export function hasAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
