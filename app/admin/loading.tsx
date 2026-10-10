import { ListSkeleton } from "@/components/Skeleton";

// Inside the admin shell: the header and sidebar stay on screen.
export default function Loading() {
  return <ListSkeleton label="Loading…" rows={8} />;
}
