/** Monta o código Pix para o QR no app do banco (padrão Brasil). */

const GUI_PIX = "br.gov.bcb.pix";
const MCC_RESTAURANTE = "5812";

function emvTLV(id, value) {
  const v = String(value);
  const len = String(v.length).padStart(2, "0");
  return id + len + v;
}

/** CRC16 conforme BR Code (UTF-8 no payload). */
export function crc16CcittPix(payload) {
  let crc = 0xffff;
  const poly = 0x1021;
  const bytes = new TextEncoder().encode(payload);
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ poly) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function sanitizePixMerchantText(str, maxLen) {
  const s = String(str || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
  return s;
}

/**
 * @param {{ chave: string, nomeRecebedor: string, cidade?: string }} opts
 * @returns {string | null} payload completo ou null se chave vazia ou inválida para TLV (len > 99 no bloco 26)
 */
export function buildPixCopiaEColaStatic(opts) {
  const chave = String(opts?.chave || "").trim();
  if (!chave) return null;

  const nomeRaw = sanitizePixMerchantText(opts?.nomeRecebedor, 25);
  const nome = nomeRaw || "RECEBEDOR";

  const cidadeRaw = sanitizePixMerchantText(opts?.cidade, 15);
  const cidade = cidadeRaw || "BRASILIA";

  const gui = emvTLV("00", GUI_PIX);
  const chaveTlv = emvTLV("01", chave);
  const merchantAccountInfo = gui + chaveTlv;
  if (merchantAccountInfo.length > 99) return null;

  const payloadSemCrc =
    emvTLV("00", "01") +
    emvTLV("01", "11") +
    emvTLV("26", merchantAccountInfo) +
    emvTLV("52", MCC_RESTAURANTE) +
    emvTLV("53", "986") +
    emvTLV("58", "BR") +
    emvTLV("59", nome) +
    emvTLV("60", cidade);

  const comCampoCrc = payloadSemCrc + "6304";
  return comCampoCrc + crc16CcittPix(comCampoCrc);
}
