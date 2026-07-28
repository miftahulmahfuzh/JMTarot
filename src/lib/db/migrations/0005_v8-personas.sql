CREATE TABLE "personas" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"locale" text NOT NULL,
	"facts" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"source_version" integer NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;