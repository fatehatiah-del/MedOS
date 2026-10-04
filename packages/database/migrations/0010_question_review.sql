CREATE TABLE "question_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"question_fingerprint" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_review_items_question_unique" UNIQUE("resource_id","question_key"),
	CONSTRAINT "question_review_items_key_format" CHECK ("question_review_items"."question_key" ~ '^q[0-9]+$'),
	CONSTRAINT "question_review_items_fingerprint_format" CHECK ("question_review_items"."question_fingerprint" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "question_review_items_note_length" CHECK ("question_review_items"."note" is null or char_length(btrim("question_review_items"."note")) between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "question_review_items" ADD CONSTRAINT "question_review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_review_items" ADD CONSTRAINT "question_review_items_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_review_items_user_idx" ON "question_review_items" USING btree ("user_id","created_at");