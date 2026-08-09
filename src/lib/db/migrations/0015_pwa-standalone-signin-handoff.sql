CREATE TABLE "auth_handoffs" (
	"challenge" text PRIMARY KEY NOT NULL,
	"device_hash" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_handoffs" ADD CONSTRAINT "auth_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_handoffs_device_idx" ON "auth_handoffs" USING btree ("device_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_handoffs_expires_idx" ON "auth_handoffs" USING btree ("expires_at");