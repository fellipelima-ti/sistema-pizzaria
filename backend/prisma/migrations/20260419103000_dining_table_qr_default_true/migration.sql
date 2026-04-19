-- Novas mesas: QR liberado por padrao. Mesas existentes: liberar para o cliente pedir pelo celular.
-- Apos "fechar comanda" o sistema continua bloqueando o QR ate o atendimento reabrir (comportamento inalterado).
ALTER TABLE "DiningTable" ALTER COLUMN "qrEnabled" SET DEFAULT true;
UPDATE "DiningTable" SET "qrEnabled" = true;
