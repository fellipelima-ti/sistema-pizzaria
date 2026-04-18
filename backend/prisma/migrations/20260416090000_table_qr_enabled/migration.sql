-- AlterTable: add QR availability flag with safe default (locked) for new tables
ALTER TABLE "DiningTable" ADD COLUMN "qrEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: if the table already has active (non-finalized) orders,
-- keep QR enabled so current in-progress tables keep working.
UPDATE "DiningTable" dt
SET "qrEnabled" = EXISTS (
  SELECT 1
  FROM "Order" o
  WHERE o."tableId" = dt."id"
    AND o."status" <> 'finalizado'
    AND (o."paymentStatus" IS NULL OR o."paymentStatus" <> 'cancelado')
);

