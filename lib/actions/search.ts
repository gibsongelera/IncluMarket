"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { guardByIp } from "@/lib/security/rate-limit";

export interface ProductSuggestion {
  id: number;
  title: string;
  category: string | null;
}

/**
 * Escape LIKE/ILIKE wildcards so a user typing `%` or `_` searches for those
 * characters rather than silently widening the pattern to match everything.
 * (PostgREST parameterises the value, so this is not an injection fix — it is
 * a correctness and cost fix: `%` alone would scan the whole catalog.)
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function suggestProducts(query: string): Promise<ProductSuggestion[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];

  // Unauthenticated and it hits the database on every keystroke.
  const guard = await guardByIp("search", { limit: 120, windowSeconds: 60 });
  if (guard) return [];

  const db = createAdminClient();
  const { data } = await db
    .from("im_products")
    .select("id, title, category")
    .eq("status", "approved")
    .ilike("title", `%${escapeLike(q)}%`)
    .order("title")
    .limit(6);

  return data ?? [];
}
