import { LoadingShell } from "@/components/LoadingShell";
import { ListSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      <ListSkeleton label="Loading your messages…" rows={5} />
    </LoadingShell>
  );
}
