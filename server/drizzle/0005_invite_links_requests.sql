CREATE TABLE "access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"invite_link_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"message" text,
	"status" text NOT NULL,
	"existing_account" boolean DEFAULT false NOT NULL,
	"requester_ip_hash" text,
	"email_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"invitation_id" text
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"team_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"project_id" text,
	"board_id" text,
	"board_role" text,
	"allowed_domain" text,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_invite_link_id_invite_links_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."invite_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_org_status" ON "access_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "access_requests_org_email" ON "access_requests" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_links_token" ON "invite_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invite_links_org" ON "invite_links" USING btree ("organization_id");