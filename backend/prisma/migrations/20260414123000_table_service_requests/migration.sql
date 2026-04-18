CREATE TABLE "TableServiceRequest" (
  "id" SERIAL NOT NULL,
  "tableId" INTEGER NOT NULL,
  "customerName" TEXT,
  "requestType" TEXT NOT NULL DEFAULT 'chamar_garcom',
  "paymentMethod" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'novo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attendedAt" TIMESTAMP(3),
  CONSTRAINT "TableServiceRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TableServiceRequest"
ADD CONSTRAINT "TableServiceRequest_tableId_fkey"
FOREIGN KEY ("tableId")
REFERENCES "DiningTable"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
