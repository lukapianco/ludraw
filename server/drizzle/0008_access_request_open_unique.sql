-- Chat 08.7 · R3: um só pedido de acesso ABERTO por organização + e-mail.
-- Duplicatas abertas que a corrida antiga deixou viram 'rejected' (fica a mais antiga; nada é apagado).
UPDATE "access_requests" AS r
SET "status" = 'rejected', "decided_at" = now()
WHERE r."status" IN ('unconfirmed', 'pending')
  AND EXISTS (
    SELECT 1 FROM "access_requests" AS o
    WHERE o."organization_id" = r."organization_id"
      AND o."email" = r."email"
      AND o."status" IN ('unconfirmed', 'pending')
      AND (o."created_at" < r."created_at" OR (o."created_at" = r."created_at" AND o."id" < r."id"))
  );--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_open_email" ON "access_requests" USING btree ("organization_id","email") WHERE status in ('unconfirmed', 'pending');
