CREATE TABLE "admin_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"subject_user_id" uuid,
	"resource" text NOT NULL,
	"resource_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_access_log_subject_created_idx" ON "admin_access_log" USING btree ("subject_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_access_log_admin_created_idx" ON "admin_access_log" USING btree ("admin_user_id","created_at" DESC NULLS LAST);