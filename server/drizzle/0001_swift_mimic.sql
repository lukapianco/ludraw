CREATE TABLE "board_ydocs" (
	"board_id" text PRIMARY KEY NOT NULL,
	"state" "bytea" NOT NULL,
	"epoch" text NOT NULL,
	"base_revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_ydocs" ADD CONSTRAINT "board_ydocs_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;