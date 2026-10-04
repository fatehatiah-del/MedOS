ALTER TABLE "semesters" ADD COLUMN "calendar_version" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_source_unique" UNIQUE("user_id","source_key");