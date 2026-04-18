-- Itens indisponiveis somem do QR e do novo pedido (painel ainda lista todos).
ALTER TABLE "Product" ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
