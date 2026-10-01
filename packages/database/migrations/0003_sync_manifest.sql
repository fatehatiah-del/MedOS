ALTER TABLE "resources" DROP CONSTRAINT "resources_kind_valid";--> statement-breakpoint
ALTER TABLE "sync_files" DROP CONSTRAINT "sync_files_status_valid";--> statement-breakpoint
ALTER TABLE "sync_files" DROP CONSTRAINT "sync_files_detected_kind_valid";--> statement-breakpoint
ALTER TABLE "sync_files" ADD COLUMN "classification_reason" text;--> statement-breakpoint
ALTER TABLE "sync_files" ADD COLUMN "override_kind" text;--> statement-breakpoint
ALTER TABLE "sync_files" ADD COLUMN "override_lecture_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_files" ADD COLUMN "ignored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_files" ADD CONSTRAINT "sync_files_override_lecture_fk" FOREIGN KEY ("override_lecture_id","user_id") REFERENCES "public"."lectures"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_kind_valid" CHECK ("resources"."kind" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'flashcards', 'image', 'supplementary'));--> statement-breakpoint
ALTER TABLE "sync_files" ADD CONSTRAINT "sync_files_override_kind_valid" CHECK ("sync_files"."override_kind" is null or "sync_files"."override_kind" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'flashcards', 'image', 'supplementary'));--> statement-breakpoint
ALTER TABLE "sync_files" ADD CONSTRAINT "sync_files_status_valid" CHECK ("sync_files"."status" in ('pending', 'synced', 'changed', 'missing', 'failed', 'needs-review', 'ignored'));--> statement-breakpoint
ALTER TABLE "sync_files" ADD CONSTRAINT "sync_files_detected_kind_valid" CHECK ("sync_files"."detected_kind" is null or "sync_files"."detected_kind" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'flashcards', 'image', 'supplementary'));