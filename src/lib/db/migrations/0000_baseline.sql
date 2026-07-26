CREATE TABLE "daily_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reader_id" text NOT NULL,
	"local_date" date NOT NULL,
	"locale" text NOT NULL,
	"body" text NOT NULL,
	"source_reading_ids" uuid[] NOT NULL,
	"prompt_version" text NOT NULL,
	"generation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_summaries_user_reader_date_locale_uq" UNIQUE("user_id","reader_id","local_date","locale")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locale" text,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frequency_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"window_key" text NOT NULL,
	"locale" text NOT NULL,
	"fingerprint" text NOT NULL,
	"top_card_id" integer NOT NULL,
	"second_card_id" integer NOT NULL,
	"body" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frequency_verdicts_user_window_locale_uq" UNIQUE("user_id","window_key","locale")
);
--> statement-breakpoint
CREATE TABLE "lotus_avatars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"summary" jsonb NOT NULL,
	"traits" jsonb NOT NULL,
	"source_version" integer NOT NULL,
	"input_hash" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"question" text,
	"question_hmac" text NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"action" text DEFAULT 'blocked' NOT NULL,
	"locale" text NOT NULL,
	"pattern_id" text,
	"confidence" real,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"answer_text" text,
	"answer_choice" text,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_answers_user_question_uq" UNIQUE("user_id","question_key"),
	CONSTRAINT "onboarding_answers_question_key_ck" CHECK ("onboarding_answers"."question_key" in ('best_thing', 'worst_thing', 'most_loved', 'introversion', 'color', 'willow_wish'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text NOT NULL,
	"birth_date" date NOT NULL,
	"onboarding_version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reading_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" integer NOT NULL,
	"reversed" boolean NOT NULL,
	"position" integer NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reader_id" text NOT NULL,
	"service_id" text NOT NULL,
	"locale" text NOT NULL,
	"question" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"verdict" text,
	"body" text,
	"gist" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"latency_ms" integer,
	"token_input" integer,
	"token_output" integer,
	"session_id" text,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"locale" text DEFAULT 'id' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"age_confirmed_at" timestamp with time zone,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequency_verdicts" ADD CONSTRAINT "frequency_verdicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotus_avatars" ADD CONSTRAINT "lotus_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_answers" ADD CONSTRAINT "onboarding_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_cards" ADD CONSTRAINT "reading_cards_reading_id_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."readings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_cards" ADD CONSTRAINT "reading_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_created_idx" ON "events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_name_created_idx" ON "events" USING btree ("name","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_session_created_idx" ON "events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_flags_user_created_idx" ON "moderation_flags" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "moderation_flags_created_idx" ON "moderation_flags" USING btree ("created_at") WHERE question is not null;--> statement-breakpoint
CREATE INDEX "reading_cards_reading_idx" ON "reading_cards" USING btree ("reading_id");--> statement-breakpoint
CREATE INDEX "reading_cards_user_date_card_idx" ON "reading_cards" USING btree ("user_id","local_date","card_id");--> statement-breakpoint
CREATE INDEX "readings_user_created_idx" ON "readings" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "readings_user_local_date_idx" ON "readings" USING btree ("user_id","local_date");