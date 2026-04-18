const IFRAME_ID = "pz-table-qr-print-frame";

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printHtmlInIframe(html) {
  if (typeof document === "undefined") return;
  let iframe = document.getElementById(IFRAME_ID);
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.setAttribute("title", "Impressão QR da mesa");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);
  }
  const win = iframe.contentWindow;
  if (!win) return;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  }, 120);
}

async function qrPngDataUrl(clientUrl) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(clientUrl, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * Abre o diálogo de impressão com etiqueta A4 (uma mesa): QR + número + link.
 * @param {{ clientUrl: string, tableNumber: number|string, tableLabel?: string|null, establishmentName?: string }} opts
 */
export async function printTableQrLabel(opts) {
  const { clientUrl, tableNumber, tableLabel, establishmentName } = opts;
  if (!clientUrl || typeof clientUrl !== "string") {
    throw new Error("URL do cardápio ausente.");
  }
  const dataUrl = await qrPngDataUrl(clientUrl);

  const title = escapeHtml(establishmentName || "Cardápio na mesa");
  const num = escapeHtml(String(tableNumber));
  const lab = tableLabel ? escapeHtml(String(tableLabel)) : "";
  const sub = lab ? `Mesa ${num} — ${lab}` : `Mesa ${num}`;
  const urlText = escapeHtml(clientUrl);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QR ${sub}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 14mm; size: A4 portrait; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      padding: 10mm;
      color: #111;
      background: #fff;
      margin: 0;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 6mm;
    }
    h2 {
      font-size: 1.75rem;
      font-weight: 800;
      margin: 0 0 4mm;
    }
    .sub {
      font-size: 0.95rem;
      color: #444;
      margin: 0 0 8mm;
    }
    img.qr {
      width: 52mm;
      height: 52mm;
      max-width: 72vw;
      max-height: 72vw;
      image-rendering: pixelated;
    }
    .url {
      font-size: 0.7rem;
      word-break: break-all;
      margin: 6mm auto 0;
      max-width: 160mm;
      color: #333;
      line-height: 1.35;
    }
    .hint {
      font-size: 0.82rem;
      margin-top: 8mm;
      color: #555;
      max-width: 140mm;
      margin-left: auto;
      margin-right: auto;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <h2>${sub}</h2>
  <p class="sub">Escaneie com a câmera do celular para abrir o cardápio.</p>
  <img class="qr" src="${dataUrl}" alt="QR code da mesa" />
  <p class="url">${urlText}</p>
  <p class="hint">Pedidos pelo cardápio digital. Dúvidas: chame um atendente.</p>
</body>
</html>`;

  printHtmlInIframe(html);
}

/**
 * Gera e baixa um PDF A4 com o QR da mesa (nome da loja, número, link).
 * @param {{ clientUrl: string, tableNumber: number|string, tableLabel?: string|null, establishmentName?: string }} opts
 */
export async function downloadTableQrPdf(opts) {
  const { clientUrl, tableNumber, tableLabel, establishmentName } = opts;
  if (!clientUrl || typeof clientUrl !== "string") {
    throw new Error("URL do cardápio ausente.");
  }
  const [{ jsPDF }, dataUrl] = await Promise.all([
    import("jspdf"),
    qrPngDataUrl(clientUrl),
  ]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const title = establishmentName || "Cardápio na mesa";
  const sub = tableLabel
    ? `Mesa ${tableNumber} — ${tableLabel}`
    : `Mesa ${tableNumber}`;

  pdf.setFontSize(16);
  pdf.text(title, pageW / 2, 22, { align: "center" });
  pdf.setFontSize(13);
  pdf.text(sub, pageW / 2, 32, { align: "center" });
  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  pdf.text("Escaneie com o celular para abrir o cardápio.", pageW / 2, 40, {
    align: "center",
  });
  pdf.setTextColor(0, 0, 0);

  const imgW = 55;
  const imgH = 55;
  const x = (pageW - imgW) / 2;
  pdf.addImage(dataUrl, "PNG", x, 46, imgW, imgH);

  pdf.setFontSize(8);
  const lines = pdf.splitTextToSize(clientUrl, pageW - 28);
  pdf.text(lines, 14, 46 + imgH + 8);

  const safeNum = String(tableNumber).replace(/[^\w-]/g, "") || "mesa";
  pdf.save(`mesa-${safeNum}-qr.pdf`);
}
