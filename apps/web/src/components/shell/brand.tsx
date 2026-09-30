import Link from "next/link";

import { HOME_HREF } from "@/config/navigation";

/** The MedOS wordmark. In the collapsed sidebar only the monogram is shown. */
export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href={HOME_HREF}
      onClick={onNavigate}
      aria-label="MedOS, go to Today"
      className="flex items-center gap-2.5 rounded-lg"
    >
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-[9px] bg-fg font-serif text-[15px] leading-none font-semibold text-canvas"
      >
        M
      </span>
      <span
        aria-hidden="true"
        className="font-serif text-[18px] leading-none font-medium tracking-[-0.01em] text-fg rail:hidden"
      >
        MedOS
      </span>
    </Link>
  );
}
