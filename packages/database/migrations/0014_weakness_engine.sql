CREATE TABLE "difficult_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "difficult_concepts_label_length" CHECK (char_length(btrim("difficult_concepts"."label")) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "difficult_concepts" ADD CONSTRAINT "difficult_concepts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "difficult_concepts" ADD CONSTRAINT "difficult_concepts_course_fk" FOREIGN KEY ("course_id","user_id") REFERENCES "public"."courses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "difficult_concepts_label_unique" ON "difficult_concepts" USING btree ("user_id","course_id",lower(btrim("label")));--> statement-breakpoint
CREATE INDEX "difficult_concepts_course_idx" ON "difficult_concepts" USING btree ("course_id");