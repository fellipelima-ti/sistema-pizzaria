CREATE TABLE "TableCheckoutDiscountLog" (
  "id" SERIAL NOT NULL,
  "tableId" INTEGER NOT NULL,
  "userId" INTEGER,
  "paymentMethod" TEXT,
  "grossTotal" DOUBLE PRECISION NOT NULL,
  "discountFixed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountPercentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "surcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netTotal" DOUBLE PRECISION NOT NULL,
  "discountReason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TableCheckoutDiscountLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TableCheckoutDiscountLog"
ADD CONSTRAINT "TableCheckoutDiscountLog_tableId_fkey"
FOREIGN KEY ("tableId")
REFERENCES "DiningTable"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "TableCheckoutDiscountLog"
ADD CONSTRAINT "TableCheckoutDiscountLog_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
