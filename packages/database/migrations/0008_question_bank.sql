CREATE TABLE "question_bank_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"item_fingerprint" text NOT NULL,
	"typed_answer" text,
	"revealed_at" timestamp with time zone NOT NULL,
	"rating" text,
	"rated_at" timestamp with time zone,
	"time_spent_ms" integer DEFAULT 0 NOT NULL,
	"attempt_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_bank_attempts_rating_valid" CHECK ("question_bank_attempts"."rating" is null or "question_bank_attempts"."rating" in ('again', 'hard', 'good', 'easy')),
	CONSTRAINT "question_bank_attempts_rated_consistent" CHECK (("question_bank_attempts"."rating" is null) = ("question_bank_attempts"."rated_at" is null)),
	CONSTRAINT "question_bank_attempts_key_format" CHECK ("question_bank_attempts"."item_key" ~ '^q[0-9]+$'),
	CONSTRAINT "question_bank_attempts_fingerprint_format" CHECK ("question_bank_attempts"."item_fingerprint" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "question_bank_attempts_typed_length" CHECK ("question_bank_attempts"."typed_answer" is null or char_length("question_bank_attempts"."typed_answer") <= 10000),
	CONSTRAINT "question_bank_attempts_time_not_negative" CHECK ("question_bank_attempts"."time_spent_ms" >= 0),
	CONSTRAINT "question_bank_attempts_number_positive" CHECK ("question_bank_attempts"."attempt_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "question_bank_attempts" ADD CONSTRAINT "question_bank_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank_attempts" ADD CONSTRAINT "question_bank_attempts_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_bank_attempts_item_idx" ON "question_bank_attempts" USING btree ("user_id","resource_id","item_fingerprint");