CREATE TABLE "mcq_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"question_key" text NOT NULL,
	"question_fingerprint" text NOT NULL,
	"selected_option" integer,
	"correct" boolean,
	"time_spent_ms" integer DEFAULT 0 NOT NULL,
	"attempt_number" integer NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcq_attempts_session_question_unique" UNIQUE("session_id","question_key"),
	CONSTRAINT "mcq_attempts_mode_valid" CHECK ("mcq_attempts"."mode" in ('learn', 'exam', 'usmle')),
	CONSTRAINT "mcq_attempts_key_format" CHECK ("mcq_attempts"."question_key" ~ '^q[0-9]+$'),
	CONSTRAINT "mcq_attempts_fingerprint_format" CHECK ("mcq_attempts"."question_fingerprint" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "mcq_attempts_selected_valid" CHECK ("mcq_attempts"."selected_option" is null or "mcq_attempts"."selected_option" >= 0),
	CONSTRAINT "mcq_attempts_unanswered_unscored" CHECK ("mcq_attempts"."selected_option" is not null or "mcq_attempts"."correct" is null),
	CONSTRAINT "mcq_attempts_time_not_negative" CHECK ("mcq_attempts"."time_spent_ms" >= 0),
	CONSTRAINT "mcq_attempts_number_positive" CHECK ("mcq_attempts"."attempt_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "mcq_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"questions" jsonb NOT NULL,
	"shuffled" boolean DEFAULT false NOT NULL,
	"time_limit_seconds" integer,
	"draft" jsonb DEFAULT '{"answers":{},"flagged":[],"timeMs":{}}'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"elapsed_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcq_sessions_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "mcq_sessions_mode_valid" CHECK ("mcq_sessions"."mode" in ('learn', 'exam', 'usmle')),
	CONSTRAINT "mcq_sessions_status_valid" CHECK ("mcq_sessions"."status" in ('in-progress', 'submitted', 'discarded')),
	CONSTRAINT "mcq_sessions_has_questions" CHECK (jsonb_array_length("mcq_sessions"."questions") >= 1),
	CONSTRAINT "mcq_sessions_time_limit_positive" CHECK ("mcq_sessions"."time_limit_seconds" is null or "mcq_sessions"."time_limit_seconds" > 0),
	CONSTRAINT "mcq_sessions_submission_consistent" CHECK (("mcq_sessions"."status" = 'submitted') = ("mcq_sessions"."submitted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_session_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."mcq_sessions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcq_sessions" ADD CONSTRAINT "mcq_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcq_sessions" ADD CONSTRAINT "mcq_sessions_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcq_attempts_question_idx" ON "mcq_attempts" USING btree ("user_id","resource_id","question_fingerprint");--> statement-breakpoint
CREATE INDEX "mcq_sessions_resource_idx" ON "mcq_sessions" USING btree ("resource_id","user_id");