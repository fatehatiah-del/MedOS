import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  /** Omitted for the current page, which is shown but not linked. */
  href?: string;
}

/** A quiet trail of the pages above this one. The last crumb is the current page. */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-fg-subtle">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
            ) : null}
            <li className="min-w-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className="rounded transition-colors duration-150 hover:text-fg"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-fg-muted">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
