-- Chat 08.7 · R5 — fase 1 (só ACRESCENTA; nada é apagado aqui).
-- S-08: hash do cookie que amarra o fluxo SSO ao navegador.
ALTER TABLE "oidc_requests" ADD COLUMN "browser_hash" text;--> statement-breakpoint
-- S-17: o link público passa a ser buscado pelo hash do token. O texto puro e o índice antigo FICAM: quem zera o
-- texto é o passo do boot (`secureLegacyPublicLinks`), e só depois de conferir que todo link tem hash e que o hash
-- confere com o token (fase 2). `token` passa a aceitar nulo para isso (restrição, não dado).
ALTER TABLE "public_links" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "public_links" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "public_links" ADD COLUMN "token_enc" text;--> statement-breakpoint
UPDATE "public_links" SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex') WHERE "token_hash" IS NULL AND "token" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "public_links" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "public_links_token_hash" ON "public_links" USING btree ("token_hash");
