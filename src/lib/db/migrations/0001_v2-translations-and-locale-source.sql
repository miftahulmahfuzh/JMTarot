CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"source_locale" text NOT NULL,
	"locale" text NOT NULL,
	"body" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translations_entity_entity_id_field_locale_uq" UNIQUE("entity","entity_id","field","locale"),
	CONSTRAINT "translations_locale_differs_ck" CHECK ("translations"."source_locale" <> "translations"."locale")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale_source" text;--> statement-breakpoint
CREATE INDEX "translations_entity_lookup_idx" ON "translations" USING btree ("entity","entity_id");