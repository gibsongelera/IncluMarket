"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Uses ONLY the publishable (anon) key, which is safe
// to ship in the client bundle — access is constrained by Row Level Security.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
