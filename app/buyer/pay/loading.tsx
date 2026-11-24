import { LoadingShell } from "@/components/LoadingShell";
import { ListSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      <ListSkeleton label="Loading the payment details…" rows={4} />
    </LoadingShell>
  );
}
