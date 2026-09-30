import { Button, EmptyState } from "@medos/ui";
import { Compass } from "lucide-react";
import Link from "next/link";

import { HOME_HREF } from "@/config/navigation";

export function NotFoundContent() {
  return (
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
  );
}
