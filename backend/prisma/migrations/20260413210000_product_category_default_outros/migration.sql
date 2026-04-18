-- Padrao neutro: cardapio pode ser pizza, pastel, bebidas, etc.
ALTER TABLE "Product" ALTER COLUMN "category" SET DEFAULT 'outros';
