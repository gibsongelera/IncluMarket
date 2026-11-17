import { LoadingShell } from "@/components/LoadingShell";
import { HomeSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingShell mainClassName="main--home">
      <HomeSkeleton />
    </LoadingShell>
  );
}
