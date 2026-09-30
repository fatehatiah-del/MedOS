import { Skeleton } from "@medos/ui";

/** Shown inside the shell while a page's data loads. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_300px] @4xl:gap-14">
        <div className="space-y-4">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
