CREATE TABLE "admin_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panel_id" text NOT NULL,
	"range_from" date NOT NULL,
	"range_to" date NOT NULL,
	"body" text NOT NULL,
	"input_hash" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_insights_panel_range_uq" UNIQUE("panel_id","range_from","range_to")
);
