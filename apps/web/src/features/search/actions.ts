"use server";

import { getWorkspace } from "@/server/workspace";

import { type SearchHit, search } from "./logic";

/** Search the signed-in user's study environment. Read-only. */
export async function searchStudy(input: unknown): Promise<SearchHit[]> {
  const { scope } = await getWorkspace();
  return search(scope, input);
}
