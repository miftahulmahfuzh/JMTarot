CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"include_question" boolean DEFAULT false NOT NULL,
	"include_nickname" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_slug_unique" UNIQUE("slug"),
	CONSTRAINT "share_links_user_entity_uq" UNIQUE("user_id","entity","entity_id")
);
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_live_slug_idx" ON "share_links" USING btree ("slug") WHERE revoked_at is null;