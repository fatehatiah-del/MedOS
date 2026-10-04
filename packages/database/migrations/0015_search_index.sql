CREATE TABLE "search_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"anchor" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source_content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_entries_anchor_unique" UNIQUE("resource_id","kind","anchor"),
	CONSTRAINT "search_entries_kind_valid" CHECK ("search_entries"."kind" in ('study-guide', 'mcq', 'question-bank')),
	CONSTRAINT "search_entries_position" CHECK ("search_entries"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "search_entries" ADD CONSTRAINT "search_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_entries" ADD CONSTRAINT "search_entries_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_entries_user_idx" ON "search_entries" USING btree ("user_id","kind");