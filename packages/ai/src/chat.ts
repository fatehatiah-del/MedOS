/*
 * Asking about the page on screen: the conversation, the page's own text,
 * and the instructions that keep answers grounded in it. Shared by every
 * provider; nothing here makes a request.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** What is on the user's screen when they ask. */
export interface PageContext {
  /** The page's title, e.g. "Introduction to Pathology — Study Guide · Pathology". */
  title: string;
  /** The path within MedOS, for orientation only. */
  path: string;
  /** The visible text of the page. */
  text: string;
  /** Text the user selected, if any: the question is most likely about it. */
  selection: string | null;
}

export const CHAT_LIMITS = {
  pageText: 120_000,
  selection: 8_000,
  message: 8_000,
  messages: 24,
} as const;

/** Instructions for every answer. */
export function systemPrompt(page: PageContext): string {
  const parts = [
    "You are the study assistant inside MedOS, a medical student's study app. The student is in year 3 of medical school (semester 5: pathology, pathophysiology, microbiology, pharmacology, public health, communication skills).",
    'Answer questions about the page they are looking at. Base your answer on the page text below first. When you add knowledge that is not on the page, say so briefly (for example "Beyond the lecture: …"). If the page contradicts standard teaching, point it out rather than silently correcting it.',
    "Be accurate, concise and exam-focused. Use Markdown: short paragraphs, bullet lists, **bold** for key terms, tables for comparisons. When asked to quiz, ask one question at a time and wait for the answer unless asked otherwise.",
    "Never invent page content, numbers or references. If the page does not contain what is needed and you are unsure, say so.",
    "",
    `Page title: ${page.title}`,
    `Location in MedOS: ${page.path}`,
  ];
  if (page.selection) {
    parts.push(
      "",
      "The student selected this passage; their question is most likely about it:",
      "<<<",
      page.selection,
      ">>>",
    );
  }
  parts.push("", "Visible text of the page:", "<<<", page.text || "(The page has no text.)", ">>>");
  return parts.join("\n");
}

/** Trims a request to the limits, keeping the latest messages. */
export function boundedConversation(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-CHAT_LIMITS.messages).map((message) => ({
    role: message.role,
    content: message.content.slice(0, CHAT_LIMITS.message),
  }));
}
