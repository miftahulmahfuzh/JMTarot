CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"reading_id" uuid,
	"op" text NOT NULL,
	"model" text NOT NULL,
	"call_class" text NOT NULL,
	"streamed" boolean NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_ms" integer,
	"status" text NOT NULL,
	"error_kind" text,
	"locale" text,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_reading_id_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_user_created_idx" ON "llm_calls" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_op_created_idx" ON "llm_calls" USING btree ("op","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_calls_local_date_idx" ON "llm_calls" USING btree ("local_date");--> statement-breakpoint
CREATE INDEX "llm_calls_reading_idx" ON "llm_calls" USING btree ("reading_id");