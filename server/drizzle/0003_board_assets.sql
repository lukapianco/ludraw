CREATE TABLE "board_asset_links" (
	"board_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_asset_links_board_id_sha256_pk" PRIMARY KEY("board_id","sha256")
);
--> statement-breakpoint
CREATE TABLE "board_assets" (
	"organization_id" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"origin_board_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone,
	CONSTRAINT "board_assets_organization_id_sha256_pk" PRIMARY KEY("organization_id","sha256")
);
--> statement-breakpoint
ALTER TABLE "board_asset_links" ADD CONSTRAINT "board_asset_links_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_assets" ADD CONSTRAINT "board_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_asset_links_sha" ON "board_asset_links" USING btree ("organization_id","sha256");--> statement-breakpoint
CREATE INDEX "board_assets_unlinked" ON "board_assets" USING btree ("unlinked_at");--> statement-breakpoint
CREATE INDEX "board_assets_sha" ON "board_assets" USING btree ("sha256");