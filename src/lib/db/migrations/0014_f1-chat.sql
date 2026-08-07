CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"locale" text NOT NULL,
	"reply_to_message_id" uuid,
	"attached_reading_id" uuid,
	"run_id" uuid,
	"beat_index" integer,
	"intent" text,
	"client_key" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_author_ck" CHECK ("chat_messages"."author" in ('user', 'thessaly', 'margaret', 'adrian')),
	CONSTRAINT "chat_messages_intent_ck" CHECK ("chat_messages"."intent" is null or "chat_messages"."intent" in ('answer', 'ask', 'react', 'tease', 'agree', 'push_back')),
	CONSTRAINT "chat_messages_reader_body_ck" CHECK ("chat_messages"."author" = 'user' or length("chat_messages"."body") > 0),
	CONSTRAINT "chat_messages_no_self_reply_ck" CHECK ("chat_messages"."reply_to_message_id" <> "chat_messages"."id")
);
--> statement-breakpoint
CREATE TABLE "chat_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"trigger_message_id" uuid,
	"trigger_reading_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"locale" text NOT NULL,
	"beats" jsonb,
	"beats_done" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_owner" text,
	"plan_model" text,
	"plan_source" text DEFAULT 'model' NOT NULL,
	"material_key" text,
	"error_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_runs_status_ck" CHECK ("chat_runs"."status" in ('pending', 'planning', 'running', 'done', 'abandoned')),
	CONSTRAINT "chat_runs_trigger_ck" CHECK ("chat_runs"."trigger" in ('user_message', 'reading_completed', 'idle_nudge', 'unanswered', 'cron')),
	CONSTRAINT "chat_runs_plan_source_ck" CHECK ("chat_runs"."plan_source" in ('model', 'fallback')),
	CONSTRAINT "chat_runs_beats_done_ck" CHECK ("chat_runs"."beats_done" >= 0),
	CONSTRAINT "chat_runs_lease_pair_ck" CHECK (("chat_runs"."lease_until" is null) = ("chat_runs"."lease_owner" is null))
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_user_message_at" timestamp with time zone,
	"last_reader_message_at" timestamp with time zone,
	"last_proactive_at" timestamp with time zone,
	"proactive_count_today" integer DEFAULT 0 NOT NULL,
	"proactive_count_date" date,
	"utc_offset_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_message_id_chat_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_attached_reading_id_readings_id_fk" FOREIGN KEY ("attached_reading_id") REFERENCES "public"."readings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_run_id_chat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_trigger_message_id_chat_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_trigger_reading_id_readings_id_fk" FOREIGN KEY ("trigger_reading_id") REFERENCES "public"."readings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_user_created_idx" ON "chat_messages" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_messages_run_idx" ON "chat_messages" USING btree ("run_id") WHERE run_id is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_reply_idx" ON "chat_messages" USING btree ("reply_to_message_id") WHERE reply_to_message_id is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_reading_idx" ON "chat_messages" USING btree ("attached_reading_id") WHERE attached_reading_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_user_client_key_uq" ON "chat_messages" USING btree ("user_id","client_key") WHERE client_key is not null;--> statement-breakpoint
CREATE INDEX "chat_runs_user_active_idx" ON "chat_runs" USING btree ("user_id","created_at") WHERE status in ('pending', 'planning', 'running');--> statement-breakpoint
CREATE INDEX "chat_runs_trigger_reading_idx" ON "chat_runs" USING btree ("trigger_reading_id") WHERE trigger_reading_id is not null;--> statement-breakpoint
CREATE INDEX "chat_runs_trigger_message_idx" ON "chat_runs" USING btree ("trigger_message_id") WHERE trigger_message_id is not null;--> statement-breakpoint
CREATE INDEX "chat_runs_trigger_created_idx" ON "chat_runs" USING btree ("trigger","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_runs_created_idx" ON "chat_runs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_runs_user_created_idx" ON "chat_runs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "chat_runs_user_material_uq" ON "chat_runs" USING btree ("user_id","material_key") WHERE material_key is not null;