-- CreateTable
CREATE TABLE "CashShift" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION,
    "openNote" TEXT,
    "closeNote" TEXT,
    "summary" JSONB,
    "userId" INTEGER,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
