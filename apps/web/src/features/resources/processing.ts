import type { ResourceSummary } from "@medos/database";
import type { BadgeTone } from "@medos/ui";

/**
 * How a material stands in the import pipeline, in words for the lecture
 * page. Every statement is read from the stored state; nothing is assumed.
 */
export interface MaterialState {
  tone: BadgeTone;
  label: string;
  /** One line of detail: what was found, or what went wrong and what to do. */
  detail: string;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** What the parsed content contains, from its summary counts. */
export function contentDetail(content: NonNullable<ResourceSummary["content"]>): string {
  const stats = content.stats;
  const count = (key: string) => stats[key] ?? 0;
  const parts: string[] = [];
  switch (content.format) {
    case "study-guide":
      parts.push(plural(count("sections"), "section"));
      if (count("tables") > 0) parts.push(plural(count("tables"), "table"));
      if (count("figures") > 0) parts.push(plural(count("figures"), "figure"));
      break;
    case "mcq-set":
      parts.push(plural(count("questions"), "question"));
      if (count("unresolved") > 0) parts.push(`${count("unresolved")} without a stated answer`);
      break;
    case "question-bank":
      parts.push(plural(count("items"), "question"));
      parts.push(`${count("paired")} with answers`);
      break;
    case "pdf":
      parts.push(plural(count("pages"), "page"));
      break;
  }
  if (content.issueCount > 0) parts.push(plural(content.issueCount, "note"));
  return parts.join(" · ");
}

export function materialState(resource: ResourceSummary): MaterialState {
  switch (resource.status) {
    case "parsed":
      if (resource.content?.current) {
        return { tone: "success", label: "Ready", detail: contentDetail(resource.content) };
      }
      return {
        tone: "warning",
        label: "Source changed",
        detail: "This file changed since it was read. It is read again on the next sync.",
      };
    case "failed":
      return {
        tone: "danger",
        label: "Could not be read",
        detail: resource.processingError ?? "MedOS could not read this file. The original is kept.",
      };
    case "unsupported":
      return {
        tone: "outline",
        label: "Not read yet",
        detail:
          resource.processingError ??
          "MedOS does not read this kind of file yet. The original is kept.",
      };
    case "pending":
    case "stored":
      return resource.content && !resource.content.current
        ? {
            tone: "warning",
            label: "Source changed",
            detail: "This file changed since it was read. It is read again on the next sync.",
          }
        : {
            tone: "neutral",
            label: "Imported",
            detail: "The original is kept. Its content is read on the next sync.",
          };
  }
}
