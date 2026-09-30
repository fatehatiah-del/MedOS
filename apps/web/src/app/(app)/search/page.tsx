import { PageHeader } from "@medos/ui";
import type { Metadata } from "next";

import { SearchPanel } from "@/features/search/search-panel";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Search"
        description="One search across everything you study, always showing its source."
      />
      <SearchPanel />
    </div>
  );
}
