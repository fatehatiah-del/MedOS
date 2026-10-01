CREATE TABLE "resource_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"format" text NOT NULL,
	"origin" text DEFAULT 'source' NOT NULL,
	"parser" text NOT NULL,
	"parser_version" integer NOT NULL,
	"source_content_hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"extracted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_contents_resource_unique" UNIQUE("resource_id"),
	CONSTRAINT "resource_contents_format_valid" CHECK ("resource_contents"."format" in ('study-guide', 'mcq-set', 'question-bank', 'pdf')),
	CONSTRAINT "resource_contents_origin_valid" CHECK ("resource_contents"."origin" in ('source', 'ai-generated')),
	CONSTRAINT "resource_contents_parser_version_positive" CHECK ("resource_contents"."parser_version" > 0),
	CONSTRAINT "resource_contents_source_hash_format" CHECK ("resource_contents"."source_content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "resource_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_media_resource_hash_unique" UNIQUE("resource_id","content_hash"),
	CONSTRAINT "resource_media_hash_format" CHECK ("resource_media"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "resource_media_type_valid" CHECK ("resource_media"."mime_type" ~ '^image/(png|jpeg|gif|webp)$'),
	CONSTRAINT "resource_media_size_not_negative" CHECK ("resource_media"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_status_valid";--> statement-breakpoint
ALTER TABLE "resource_contents" ADD CONSTRAINT "resource_contents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_contents" ADD CONSTRAINT "resource_contents_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_media" ADD CONSTRAINT "resource_media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_media" ADD CONSTRAINT "resource_media_resource_fk" FOREIGN KEY ("resource_id","user_id") REFERENCES "public"."resources"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_media_hash_idx" ON "resource_media" USING btree ("content_hash");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_status_valid" CHECK ("resources"."status" in ('pending', 'stored', 'parsed', 'failed', 'unsupported'));