ALTER TABLE "User"
ADD COLUMN "recoveryCodeHash" TEXT,
ADD COLUMN "recoveryCodeExpiresAt" TIMESTAMP(3);
