ALTER TABLE "study_sessions" DROP CONSTRAINT "study_sessions_activity_valid";--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "running_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "paused_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_one_open_idx" ON "study_sessions" USING btree ("user_id") WHERE "study_sessions"."ended_at" is null;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_paused_reason_valid" CHECK ("study_sessions"."paused_reason" is null or "study_sessions"."paused_reason" in ('manual', 'idle', 'hidden'));--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_running_state" CHECK (("study_sessions"."ended_at" is null or "study_sessions"."running_since" is null) and ("study_sessions"."running_since" is null or "study_sessions"."paused_reason" is null));--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_running_order" CHECK ("study_sessions"."running_since" is null or "study_sessions"."running_since" >= "study_sessions"."started_at");--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_activity_valid" CHECK ("study_sessions"."activity" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'flashcards', 'revision', 'other'));