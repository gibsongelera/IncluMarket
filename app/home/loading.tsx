import { LoadingShell } from "@/components/LoadingShell";
import { GridSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      <GridSkeleton label="Loading the shop…" cards={8} />
    </LoadingShell>
  );
}
