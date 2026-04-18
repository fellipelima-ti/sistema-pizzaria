-- AlterTable
ALTER TABLE "EstablishmentSetting" ADD COLUMN "deliveryFeeDefault" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "deliveryAddress" TEXT;
