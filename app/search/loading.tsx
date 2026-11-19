import { LoadingShell } from "@/components/LoadingShell";
import { GridSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      <GridSkeleton label="Searching…" cards={8} />
    </LoadingShell>
  );
}
