"use client";

import { usePathname } from "next/navigation";
import { DashboardSkeleton, ListSkeleton } from "@/components/Skeleton";

/**
 * The loading screen of every admin page (none has its own); the header and
 * sidebar stay on screen. The overview gets one shaped like it: the head, the
 * KPI row and two rows of an 8 + 4 card pair. The list pages keep the list,
 * so their rows do not land where a dashboard was drawn. A client component
 * only to read the path.
 */
export default function Loading() {
  return usePathname() === "/admin" ? <DashboardSkeleton label="Loading…" /> : <ListSkeleton label="Loading…" rows={8} />;
}
