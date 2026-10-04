CREATE TABLE "flashcard_decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"lecture_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_decks_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "flashcard_decks_name_length" CHECK (char_length(btrim("flashcard_decks"."name")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "flashcard_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"rating" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"state_before" text NOT NULL,
	"due_before" timestamp with time zone NOT NULL,
	"state_after" text NOT NULL,
	"due_after" timestamp with time zone NOT NULL,
	"stability_after" double precision NOT NULL,
	"difficulty_after" double precision NOT NULL,
	"scheduled_days_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_reviews_rating_valid" CHECK ("flashcard_reviews"."rating" in ('again', 'hard', 'good', 'easy')),
	CONSTRAINT "flashcard_reviews_state_before_valid" CHECK ("flashcard_reviews"."state_before" in ('new', 'learning', 'review', 'relearning')),
	CONSTRAINT "flashcard_reviews_state_after_valid" CHECK ("flashcard_reviews"."state_after" in ('new', 'learning', 'review', 'relearning')),
	CONSTRAINT "flashcard_reviews_duration_not_negative" CHECK ("flashcard_reviews"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deck_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"source_resource_id" uuid,
	"source_section_id" text,
	"source_unit_path" text,
	"source_start" integer,
	"source_end" integer,
	"source_quote" text,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision DEFAULT 0 NOT NULL,
	"difficulty" double precision DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"last_review" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcards_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "flashcards_origin_valid" CHECK ("flashcards"."origin" in ('manual', 'study-guide')),
	CONSTRAINT "flashcards_state_valid" CHECK ("flashcards"."state" in ('new', 'learning', 'review', 'relearning')),
	CONSTRAINT "flashcards_front_length" CHECK (char_length(btrim("flashcards"."front")) between 1 and 5000),
	CONSTRAINT "flashcards_back_length" CHECK (char_length(btrim("flashcards"."back")) between 1 and 5000),
	CONSTRAINT "flashcards_source_consistent" CHECK (("flashcards"."origin" = 'study-guide') = ("flashcards"."source_resource_id" is not null)),
	CONSTRAINT "flashcards_source_section_format" CHECK ("flashcards"."source_section_id" is null or "flashcards"."source_section_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "flashcards_counts_not_negative" CHECK ("flashcards"."reps" >= 0 and "flashcards"."lapses" >= 0 and "flashcards"."scheduled_days" >= 0 and "flashcards"."learning_steps" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_id_course_user_unique" UNIQUE("id","course_id","user_id");
--> statement-breakpoint
ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_course_fk" FOREIGN KEY ("course_id","user_id") REFERENCES "public"."courses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_lecture_fk" FOREIGN KEY ("lecture_id","course_id","user_id") REFERENCES "public"."lectures"("id","course_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_card_fk" FOREIGN KEY ("card_id","user_id") REFERENCES "public"."flashcards"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_deck_fk" FOREIGN KEY ("deck_id","user_id") REFERENCES "public"."flashcard_decks"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_source_fk" FOREIGN KEY ("source_resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_decks_lecture_unique" ON "flashcard_decks" USING btree ("lecture_id") WHERE "flashcard_decks"."lecture_id" is not null;--> statement-breakpoint
CREATE INDEX "flashcard_decks_course_idx" ON "flashcard_decks" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "flashcard_reviews_card_idx" ON "flashcard_reviews" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "flashcard_reviews_user_time_idx" ON "flashcard_reviews" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "flashcards_deck_due_idx" ON "flashcards" USING btree ("deck_id","due");