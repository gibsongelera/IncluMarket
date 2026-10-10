import { LoadingShell } from "@/components/LoadingShell";
import { GridSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      <GridSkeleton label="Loading your wishlist…" cards={5} wide />
    </LoadingShell>
  );
}
