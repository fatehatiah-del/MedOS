CREATE TABLE "original_lecture_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"page" integer NOT NULL,
	"note" text,
	"source_content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "original_lecture_annotations_kind_valid" CHECK ("original_lecture_annotations"."kind" in ('bookmark', 'note', 'review-later')),
	CONSTRAINT "original_lecture_annotations_page_positive" CHECK ("original_lecture_annotations"."page" >= 1),
	CONSTRAINT "original_lecture_annotations_note_only_on_notes" CHECK (("original_lecture_annotations"."kind" = 'note') = ("original_lecture_annotations"."note" is not null)),
	CONSTRAINT "original_lecture_annotations_note_length" CHECK ("original_lecture_annotations"."note" is null or char_length(btrim("original_lecture_annotations"."note")) between 1 and 10000),
	CONSTRAINT "original_lecture_annotations_source_hash_format" CHECK ("original_lecture_annotations"."source_content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "original_lecture_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "original_lecture_positions_resource_unique" UNIQUE("resource_id"),
	CONSTRAINT "original_lecture_positions_page_positive" CHECK ("original_lecture_positions"."page" >= 1)
);
--> statement-breakpoint
ALTER TABLE "original_lecture_annotations" ADD CONSTRAINT "original_lecture_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "original_lecture_annotations" ADD CONSTRAINT "original_lecture_annotations_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "original_lecture_positions" ADD CONSTRAINT "original_lecture_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "original_lecture_positions" ADD CONSTRAINT "original_lecture_positions_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "original_lecture_annotations_resource_idx" ON "original_lecture_annotations" USING btree ("resource_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "original_lecture_annotations_page_unique" ON "original_lecture_annotations" USING btree ("resource_id","kind","page") WHERE "original_lecture_annotations"."kind" <> 'note';