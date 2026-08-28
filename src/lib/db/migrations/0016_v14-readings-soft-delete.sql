ALTER TABLE "reading_cards" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "deleted_at" timestamp with time zone;