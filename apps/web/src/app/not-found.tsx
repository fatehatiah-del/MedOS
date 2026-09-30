import { Button, EmptyState } from "@medos/ui";
import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HOME_HREF } from "@/config/navigation";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
        headingLevel={2}
        icon={<Compass />}
        title="Page not found"
        description="There is nothing at this address. It may have moved, or the link may be incomplete."
      >
        <Button asChild variant="primary">
          <Link href={HOME_HREF}>Go to Today</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
