-- Meia a meia: segundo sabor (apenas quando sizeLabel for G / grande).
ALTER TABLE "OrderItem" ADD COLUMN "secondProductId" INTEGER;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_secondProductId_fkey"
  FOREIGN KEY ("secondProductId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
