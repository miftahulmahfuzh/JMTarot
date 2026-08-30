CREATE TABLE "user_memory" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"dismissed_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"source_version" integer NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_memory_items_array_ck" CHECK (jsonb_typeof("user_memory"."items") = 'array'),
	CONSTRAINT "user_memory_dismissed_array_ck" CHECK (jsonb_typeof("user_memory"."dismissed_ids") = 'array')
);
--> statement-breakpoint
ALTER TABLE "user_memory" ADD CONSTRAINT "user_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;