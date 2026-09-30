CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"code" text,
	"color_token" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_semester_slug_unique" UNIQUE("semester_id","slug"),
	CONSTRAINT "courses_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "courses_slug_format" CHECK ("courses"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "lectures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"week_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"held_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lectures_week_number_unique" UNIQUE("week_id","number"),
	CONSTRAINT "lectures_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "lectures_number_positive" CHECK ("lectures"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"academic_year" text,
	"institution" text,
	"programme" text,
	"student_group" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"midterms_start_on" date,
	"midterms_end_on" date,
	"finals_start_on" date,
	"finals_end_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semesters_user_slug_unique" UNIQUE("user_id","slug"),
	CONSTRAINT "semesters_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "semesters_slug_format" CHECK ("semesters"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "semesters_term_order" CHECK ("semesters"."ends_on" >= "semesters"."starts_on"),
	CONSTRAINT "semesters_midterms_period" CHECK (("semesters"."midterms_start_on" is null and "semesters"."midterms_end_on" is null) or ("semesters"."midterms_start_on" is not null and "semesters"."midterms_end_on" is not null and "semesters"."midterms_end_on" >= "semesters"."midterms_start_on")),
	CONSTRAINT "semesters_finals_period" CHECK (("semesters"."finals_start_on" is null and "semesters"."finals_end_on" is null) or ("semesters"."finals_start_on" is not null and "semesters"."finals_end_on" is not null and "semesters"."finals_end_on" >= "semesters"."finals_start_on"))
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weeks_course_number_unique" UNIQUE("course_id","number"),
	CONSTRAINT "weeks_id_course_user_unique" UNIQUE("id","course_id","user_id"),
	CONSTRAINT "weeks_number_positive" CHECK ("weeks"."number" >= 1),
	CONSTRAINT "weeks_date_order" CHECK ("weeks"."starts_on" is null or "weeks"."ends_on" is null or "weeks"."ends_on" >= "weeks"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"type" text NOT NULL,
	"origin" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text NOT NULL,
	"location" text,
	"student_group" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_id_user_course_unique" UNIQUE("id","user_id","course_id"),
	CONSTRAINT "calendar_events_type_valid" CHECK ("calendar_events"."type" in ('lecture', 'lab', 'exam', 'midterm', 'academic-deadline', 'holiday', 'study-session', 'revision', 'assignment', 'personal')),
	CONSTRAINT "calendar_events_origin_valid" CHECK ("calendar_events"."origin" in ('university', 'personal')),
	CONSTRAINT "calendar_events_time_order" CHECK ("calendar_events"."ends_at" >= "calendar_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "exam_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_event_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_events_calendar_event_unique" UNIQUE("calendar_event_id"),
	CONSTRAINT "exam_events_kind_valid" CHECK ("exam_events"."kind" in ('midterm', 'final', 'other'))
);
--> statement-breakpoint
CREATE TABLE "lecture_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lecture_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecture_progress_lecture_unique" UNIQUE("lecture_id")
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"lecture_id" uuid,
	"activity" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_activity_valid" CHECK ("study_sessions"."activity" in ('study-guide', 'mcq', 'question-bank', 'flashcards', 'revision', 'other')),
	CONSTRAINT "study_sessions_active_not_negative" CHECK ("study_sessions"."active_seconds" >= 0),
	CONSTRAINT "study_sessions_time_order" CHECK ("study_sessions"."ended_at" is null or "study_sessions"."ended_at" >= "study_sessions"."started_at")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lecture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"source_path" text,
	"storage_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_lecture_hash_unique" UNIQUE("lecture_id","content_hash"),
	CONSTRAINT "resources_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "resources_kind_valid" CHECK ("resources"."kind" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'image', 'supplementary')),
	CONSTRAINT "resources_status_valid" CHECK ("resources"."status" in ('pending', 'stored', 'parsed', 'failed')),
	CONSTRAINT "resources_size_not_negative" CHECK ("resources"."size_bytes" >= 0),
	CONSTRAINT "resources_hash_format" CHECK ("resources"."content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "sync_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"relative_path" text NOT NULL,
	"content_hash" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"detected_course_slug" text,
	"detected_week_number" integer,
	"detected_lecture_number" integer,
	"detected_kind" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"last_synced_at" timestamp with time zone,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_files_user_path_unique" UNIQUE("user_id","relative_path"),
	CONSTRAINT "sync_files_status_valid" CHECK ("sync_files"."status" in ('pending', 'synced', 'changed', 'missing', 'failed')),
	CONSTRAINT "sync_files_detected_kind_valid" CHECK ("sync_files"."detected_kind" is null or "sync_files"."detected_kind" in ('study-guide', 'original-lecture', 'mcq', 'question-bank', 'image', 'supplementary')),
	CONSTRAINT "sync_files_size_not_negative" CHECK ("sync_files"."size_bytes" >= 0),
	CONSTRAINT "sync_files_hash_format" CHECK ("sync_files"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sync_files_path_relative" CHECK ("sync_files"."relative_path" !~ '^([a-zA-Z]:|/)' and position(chr(92) in "sync_files"."relative_path") = 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"auth_subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_auth_subject_unique" UNIQUE("auth_subject"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_semester_fk" FOREIGN KEY ("semester_id","user_id") REFERENCES "public"."semesters"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_week_fk" FOREIGN KEY ("week_id","course_id","user_id") REFERENCES "public"."weeks"("id","course_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_course_fk" FOREIGN KEY ("course_id","user_id") REFERENCES "public"."courses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_course_fk" FOREIGN KEY ("course_id","user_id") REFERENCES "public"."courses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_calendar_event_fk" FOREIGN KEY ("calendar_event_id","user_id","course_id") REFERENCES "public"."calendar_events"("id","user_id","course_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecture_progress" ADD CONSTRAINT "lecture_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecture_progress" ADD CONSTRAINT "lecture_progress_lecture_fk" FOREIGN KEY ("lecture_id","user_id") REFERENCES "public"."lectures"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_fk" FOREIGN KEY ("course_id","user_id") REFERENCES "public"."courses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_lecture_fk" FOREIGN KEY ("lecture_id","user_id") REFERENCES "public"."lectures"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_lecture_fk" FOREIGN KEY ("lecture_id","user_id") REFERENCES "public"."lectures"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_files" ADD CONSTRAINT "sync_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_files" ADD CONSTRAINT "sync_files_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lectures_course_idx" ON "lectures" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "calendar_events_user_starts_idx" ON "calendar_events" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_course_idx" ON "calendar_events" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "exam_events_course_idx" ON "exam_events" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "study_sessions_user_started_idx" ON "study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "study_sessions_course_idx" ON "study_sessions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "study_sessions_lecture_idx" ON "study_sessions" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "sync_files_resource_idx" ON "sync_files" USING btree ("resource_id");--> statement-breakpoint
CREATE VIEW "public"."course_progress" AS (select "courses"."id" as "course_id", "courses"."user_id" as "user_id", count("lectures"."id")::int as "lecture_count", count("lecture_progress"."completed_at")::int as "completed_lecture_count" from "courses" left join "lectures" on "lectures"."course_id" = "courses"."id" left join "lecture_progress" on "lecture_progress"."lecture_id" = "lectures"."id" group by "courses"."id", "courses"."user_id");