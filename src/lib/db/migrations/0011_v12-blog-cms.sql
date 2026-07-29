CREATE TABLE "blog_post_locales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"hero_card_slug" text,
	"hero_alt" text,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_locales_post_locale_uq" UNIQUE("post_id","locale"),
	CONSTRAINT "blog_post_locales_hero_pair_ck" CHECK (("blog_post_locales"."hero_card_slug" IS NULL) = ("blog_post_locales"."hero_alt" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"date_published" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "blog_posts_slug_shape_ck" CHECK ("blog_posts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "blog_post_locales" ADD CONSTRAINT "blog_post_locales_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_post_locales_status_idx" ON "blog_post_locales" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_post_locales_post_idx" ON "blog_post_locales" USING btree ("post_id");