CREATE TABLE "removed_email_marks" (
	"organization_id" text NOT NULL,
	"email_hmac" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "removed_email_marks_organization_id_email_hmac_pk" PRIMARY KEY("organization_id","email_hmac")
);
