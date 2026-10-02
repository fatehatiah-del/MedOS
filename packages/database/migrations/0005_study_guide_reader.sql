CREATE TABLE "study_guide_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"section_id" text,
	"unit_path" text,
	"start_offset" integer,
	"end_offset" integer,
	"quote" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"suffix" text DEFAULT '' NOT NULL,
	"note" text,
	"source_content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_guide_annotations_kind_valid" CHECK ("study_guide_annotations"."kind" in ('highlight', 'note', 'bookmark', 'review-later')),
	CONSTRAINT "study_guide_annotations_section_format" CHECK ("study_guide_annotations"."section_id" is null or "study_guide_annotations"."section_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "study_guide_annotations_range_valid" CHECK (("study_guide_annotations"."unit_path" is null and "study_guide_annotations"."start_offset" is null and "study_guide_annotations"."end_offset" is null and "study_guide_annotations"."section_id" is not null)
        or ("study_guide_annotations"."unit_path" is not null and "study_guide_annotations"."start_offset" >= 0 and "study_guide_annotations"."end_offset" > "study_guide_annotations"."start_offset")),
	CONSTRAINT "study_guide_annotations_quote_length" CHECK (char_length("study_guide_annotations"."quote") between 1 and 5000),
	CONSTRAINT "study_guide_annotations_note_only_on_notes" CHECK (("study_guide_annotations"."kind" = 'note') = ("study_guide_annotations"."note" is not null)),
	CONSTRAINT "study_guide_annotations_note_length" CHECK ("study_guide_annotations"."note" is null or char_length(btrim("study_guide_annotations"."note")) between 1 and 10000),
	CONSTRAINT "study_guide_annotations_source_hash_format" CHECK ("study_guide_annotations"."source_content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "study_guide_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"furthest_section_id" text NOT NULL,
	"furthest_position" integer NOT NULL,
	"section_count" integer NOT NULL,
	"last_section_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_guide_progress_resource_unique" UNIQUE("resource_id"),
	CONSTRAINT "study_guide_progress_position_valid" CHECK ("study_guide_progress"."section_count" >= 1 and "study_guide_progress"."furthest_position" between 1 and "study_guide_progress"."section_count"),
	CONSTRAINT "study_guide_progress_section_format" CHECK ("study_guide_progress"."furthest_section_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and "study_guide_progress"."last_section_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "study_guide_annotations" ADD CONSTRAINT "study_guide_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_guide_annotations" ADD CONSTRAINT "study_guide_annotations_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_guide_progress" ADD CONSTRAINT "study_guide_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_guide_progress" ADD CONSTRAINT "study_guide_progress_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_guide_annotations_resource_idx" ON "study_guide_annotations" USING btree ("resource_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_guide_annotations_place_unique" ON "study_guide_annotations" USING btree ("resource_id","kind",coalesce("section_id", ''),coalesce("unit_path", ''),coalesce("start_offset", -1),coalesce("end_offset", -1)) WHERE "study_guide_annotations"."kind" <> 'note';