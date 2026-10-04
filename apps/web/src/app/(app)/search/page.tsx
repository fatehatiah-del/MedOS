import { PageHeader } from "@medos/ui";
import type { Metadata } from "next";

import { SearchPanel } from "@/features/search/search-panel";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Search" };

interface SearchPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  await requireUser();
  const q = (await searchParams).q;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Search"
        description="One search across everything you study, always showing its source."
      />
      <SearchPanel initialQuery={(Array.isArray(q) ? q[0] : q) ?? ""} />
    </div>
  );
}
