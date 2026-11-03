CREATE TABLE "notebook_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notebook_images_user_hash_unique" UNIQUE("user_id","content_hash"),
	CONSTRAINT "notebook_images_hash_format" CHECK ("notebook_images"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "notebook_images_type_valid" CHECK ("notebook_images"."mime_type" ~ '^image/(png|jpeg|gif|webp)$'),
	CONSTRAINT "notebook_images_size_valid" CHECK ("notebook_images"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "notebook_images" ADD CONSTRAINT "notebook_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;