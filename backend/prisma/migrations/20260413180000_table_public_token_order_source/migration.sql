-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderSource" TEXT NOT NULL DEFAULT 'staff';

-- AlterTable: add nullable token, backfill, then enforce NOT NULL + unique
ALTER TABLE "DiningTable" ADD COLUMN "publicToken" TEXT;

UPDATE "DiningTable" SET "publicToken" = gen_random_uuid()::text WHERE "publicToken" IS NULL;

ALTER TABLE "DiningTable" ALTER COLUMN "publicToken" SET NOT NULL;

CREATE UNIQUE INDEX "DiningTable_publicToken_key" ON "DiningTable"("publicToken");

ALTER TABLE "DiningTable" ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
