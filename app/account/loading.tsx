import { ListSkeleton } from "@/components/Skeleton";

// The account layout (header, section links) stays on screen; only the
// section below it waits.
export default function Loading() {
  return <ListSkeleton label="Loading your account…" rows={4} />;
}
