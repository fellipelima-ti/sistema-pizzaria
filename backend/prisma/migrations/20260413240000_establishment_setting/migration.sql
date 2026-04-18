-- CreateTable
CREATE TABLE "EstablishmentSetting" (
    "id" INTEGER NOT NULL,
    "tradeName" TEXT NOT NULL DEFAULT 'Pizzaria',
    "logoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstablishmentSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EstablishmentSetting" ("id", "tradeName", "logoUrl", "updatedAt")
VALUES (1, 'Pizzaria', NULL, CURRENT_TIMESTAMP);
