import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { HOME_HREF } from "@/config/navigation";

/** The MedOS wordmark. In the collapsed sidebar only the tile is shown. */
export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href={HOME_HREF}
      onClick={onNavigate}
      aria-label="Med OS, go to Today"
      className="flex items-center rounded-lg"
    >
      <BrandMark wordmarkClassName="rail:hidden" />
    </Link>
  );
}
