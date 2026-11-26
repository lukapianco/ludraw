CREATE TABLE "mail_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"host" text,
	"port" integer,
	"security" text,
	"username" text,
	"from_address" text,
	"password_enc" text,
	"password_key_check" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "mail_settings_single_row" CHECK ("mail_settings"."id" = 'default')
);
