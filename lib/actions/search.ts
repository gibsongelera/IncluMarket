"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface ProductSuggestion {
  id: number;
  title: string;
  category: string | null;
}

export async function suggestProducts(query: string): Promise<ProductSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const db = createAdminClient();
  const { data } = await db
    .from("im_products")
    .select("id, title, category")
    .eq("status", "approved")
    .ilike("title", `%${q}%`)
    .order("title")
    .limit(6);

  return data ?? [];
}
