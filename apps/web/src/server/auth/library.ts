import { type Database, users } from "@medos/database";
import { mirrorLibrary } from "@medos/sync/mirror";
import { eq } from "drizzle-orm";

/**
 * Gives a newly created account the course library: a copy of the source
 * account's material (weeks, lectures, originals, study guides, quizzes and
 * question banks), exactly as `medos-sync mirror` does. Study data (progress,
 * attempts, notes, highlights, flashcards) is never copied.
 *
 * Runs after the account exists, so it never blocks or fails a sign-up: a
 * problem is logged and the owner can still run the mirror by hand.
 */
export async function giveLibraryTo(
  db: Database,
  sourceEmail: string | null,
  user: { id: string; email: string },
): Promise<void> {
  if (!sourceEmail || user.email.trim().toLowerCase() === sourceEmail) return;

  try {
    const [source] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, sourceEmail));
    if (!source) {
      console.warn(`[library] No account uses ${sourceEmail}; ${user.email} starts empty.`);
      return;
    }
    const report = await mirrorLibrary(db, source.id, user.id, { dryRun: false });
    console.info(
      `[library] Gave ${user.email} ${report.files.length} files ` +
        `(${report.lecturesCreated} lectures, ${report.skipped.length} skipped).`,
    );
  } catch (error) {
    console.error(`[library] Could not give ${user.email} the course library.`, error);
  }
}
