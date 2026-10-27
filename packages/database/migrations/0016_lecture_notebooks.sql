CREATE TABLE "lecture_notebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lecture_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecture_notebooks_lecture_unique" UNIQUE("lecture_id"),
	CONSTRAINT "lecture_notebooks_revision_positive" CHECK ("lecture_notebooks"."revision" >= 1),
	CONSTRAINT "lecture_notebooks_content_is_doc" CHECK ("lecture_notebooks"."content"->>'type' = 'doc'),
	CONSTRAINT "lecture_notebooks_content_size" CHECK (octet_length("lecture_notebooks"."content"::text) <= 2000000),
	CONSTRAINT "lecture_notebooks_text_length" CHECK (char_length("lecture_notebooks"."plain_text") <= 200000)
);
--> statement-breakpoint
ALTER TABLE "lecture_notebooks" ADD CONSTRAINT "lecture_notebooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecture_notebooks" ADD CONSTRAINT "lecture_notebooks_lecture_fk" FOREIGN KEY ("lecture_id","user_id") REFERENCES "public"."lectures"("id","user_id") ON DELETE restrict ON UPDATE no action;