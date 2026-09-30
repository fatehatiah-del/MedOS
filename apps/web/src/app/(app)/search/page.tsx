import { PageHeader } from "@medos/ui";
import type { Metadata } from "next";

import { SearchPanel } from "@/features/search/search-panel";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
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
