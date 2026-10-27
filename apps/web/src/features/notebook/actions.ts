"use server";

import type { NotebookDocument, NotebookSaveResult } from "@medos/database";

import { getWorkspace } from "@/server/workspace";

import { isNotebookDocument } from "./document";

/*
 * Saving a lecture notebook. The session is checked here (a Server Function
 * is reachable by a direct POST) and the save goes through the signed-in
 * user's scope. Nothing is re-rendered: the editor already shows what was
 * saved, and re-rendering the Study Guide on every keystroke would be slow.
 */

const UNREADABLE = "These notes could not be read. Reload and try again.";

/**
 * `content` is the editor's document as a JSON string: the editor's own
 * objects are not plain enough to pass through a Server Function as they are.
 */
export async function saveLectureNotebook(input: {
  lectureId: string;
  content: string;
  plainText: string;
  baseRevision: number;
}): Promise<NotebookSaveResult> {
  const { scope } = await getWorkspace();
  if (typeof input?.lectureId !== "string" || typeof input.content !== "string") {
    return { status: "invalid", message: UNREADABLE };
  }
  let content: unknown;
  try {
    content = JSON.parse(input.content);
  } catch {
    return { status: "invalid", message: UNREADABLE };
  }
  if (!isNotebookDocument(content)) return { status: "invalid", message: UNREADABLE };
  return scope.notebooks.save(input.lectureId, {
    content: content as NotebookDocument,
    plainText: input.plainText,
    baseRevision: input.baseRevision,
  });
}
