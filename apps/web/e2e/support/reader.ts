import { readFileSync } from "node:fs";
import path from "node:path";

import type { TestUser } from "./users";

/*
 * The account and material of the Study Guide reader tests. The material is
 * synthetic and created in the scratch E2E database before the server starts
 * (see reader-fixture.ts); its ids are recorded in `.e2e/reader.json`.
 */

export const READER_USER: TestUser = {
  name: "Reader Student",
  email: "reader@e2e.test",
  password: "e2e-scratch-password-01",
};

/** Pages of the synthetic lecture PDF (`pdfId`). */
export const LECTURE_PAGES = 40;

/** Types and topics of the synthetic quiz; the first option is always correct. */
export const QUIZ_QUESTIONS = [
  { type: "vignette", topic: "Receptors" },
  { type: "recall", topic: "Receptors" },
  { type: "mechanism", topic: "Signalling" },
  { type: "graph", topic: "Signalling" },
  { type: "consequence", topic: "Antagonism" },
  { type: "application", topic: "Antagonism" },
] as const;

/** USMLE mode uses vignette, mechanism, consequence and application questions. */
export const QUIZ_USMLE_COUNT = 4;

export interface ReaderFixture {
  lectureId: string;
  /** The long synthetic guide. */
  guideId: string;
  /** A second guide in the same lecture, with its own image. */
  secondGuideId: string;
  /** The lecture's PDF: material, but not a Study Guide. */
  pdfId: string;
  /** The synthetic MCQ quiz of the lecture. */
  mcqId: string;
  /** Another lecture of the same account. */
  otherLectureId: string;
  guideImages: string[];
  secondGuideImages: string[];
}

/** Where the setup project saves the reader account's signed-in state. */
export const READER_STATE = path.join(__dirname, "..", "..", ".e2e", "state", "reader.json");

export const READER_FIXTURE_FILE = path.join(__dirname, "..", "..", ".e2e", "reader.json");

export function readerFixture(): ReaderFixture {
  return JSON.parse(readFileSync(READER_FIXTURE_FILE, "utf8")) as ReaderFixture;
}

export const guideUrl = (fixture: ReaderFixture, resourceId = fixture.guideId) =>
  `/courses/pharmacology/lectures/${fixture.lectureId}/study-guide/${resourceId}`;

export const lectureUrl = (fixture: ReaderFixture, resourceId = fixture.pdfId) =>
  `/courses/pharmacology/lectures/${fixture.lectureId}/original/${resourceId}`;

export const mcqUrl = (fixture: ReaderFixture) =>
  `/courses/pharmacology/lectures/${fixture.lectureId}/mcq/${fixture.mcqId}`;
