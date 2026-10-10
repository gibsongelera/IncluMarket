import { ListSkeleton } from "@/components/Skeleton";

// Inside the Seller Centre shell: the header and sidebar stay on screen.
export default function Loading() {
  return <ListSkeleton label="Loading Seller Centre…" rows={6} />;
}
