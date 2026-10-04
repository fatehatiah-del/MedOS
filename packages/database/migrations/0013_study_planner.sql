CREATE TABLE "daily_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"suggestion_key" text,
	"edited" boolean DEFAULT false NOT NULL,
	"activity" text NOT NULL,
	"course_id" uuid,
	"lecture_id" uuid,
	"resource_id" uuid,
	"title" text NOT NULL,
	"minutes" integer NOT NULL,
	"score" integer,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"postponed_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plan_items_source_valid" CHECK ("daily_plan_items"."source" in ('suggested', 'manual', 'postponed')),
	CONSTRAINT "daily_plan_items_status_valid" CHECK ("daily_plan_items"."status" in ('planned', 'done', 'dismissed', 'postponed')),
	CONSTRAINT "daily_plan_items_activity_valid" CHECK ("daily_plan_items"."activity" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'flashcards', 'revision', 'other')),
	CONSTRAINT "daily_plan_items_minutes_range" CHECK ("daily_plan_items"."minutes" between 5 and 720),
	CONSTRAINT "daily_plan_items_title_length" CHECK (char_length(btrim("daily_plan_items"."title")) between 1 and 200),
	CONSTRAINT "daily_plan_items_suggestion_key" CHECK (("daily_plan_items"."source" <> 'suggested' or "daily_plan_items"."suggestion_key" is not null) and ("daily_plan_items"."source" <> 'manual' or "daily_plan_items"."suggestion_key" is null))
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"suggested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_user_date_unique" UNIQUE("user_id","date"),
	CONSTRAINT "daily_plans_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday_minutes" integer NOT NULL,
	"weekend_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_unique" UNIQUE("user_id"),
	CONSTRAINT "user_settings_minutes_range" CHECK ("user_settings"."weekday_minutes" between 0 and 1440 and "user_settings"."weekend_minutes" between 0 and 1440)
);
--> statement-breakpoint
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_plan_fk" FOREIGN KEY ("plan_id","user_id") REFERENCES "public"."daily_plans"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_course_fk" FOREIGN KEY ("course_id","user_id") REFERENCES "public"."courses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_lecture_fk" FOREIGN KEY ("lecture_id","user_id") REFERENCES "public"."lectures"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_plan_items_plan_idx" ON "daily_plan_items" USING btree ("plan_id","position");