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
    width: 480,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
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
  const badgeHtml = lab ? `Mesa ${num} — ${lab}` : `Mesa ${num}`;
  const urlText = escapeHtml(clientUrl);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QR ${sub}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 12mm; size: A4 portrait; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif;
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8mm;
      color: #0f172a;
      background: linear-gradient(165deg, #f1f5f9 0%, #e2e8f0 45%, #f8fafc 100%);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 100%;
      max-width: 150mm;
      background: #fff;
      border-radius: 20px;
      border: 1px solid #cbd5e1;
      box-shadow:
        0 4px 6px -1px rgba(15, 23, 42, 0.06),
        0 20px 40px -12px rgba(15, 23, 42, 0.12);
      padding: 12mm 11mm 11mm;
      text-align: center;
    }
    .brand-bar {
      height: 5px;
      border-radius: 999px;
      background: linear-gradient(90deg, #0f766e, #14b8a6, #2dd4bf);
      margin: 0 auto 8mm;
      max-width: 48mm;
    }
    .est-name {
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 5mm;
    }
    .mesa-badge {
      display: inline-block;
      font-size: 1.85rem;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.1;
      color: #0f172a;
      padding: 3.5mm 7mm;
      border-radius: 14px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #0d9488;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
      margin: 0 0 2mm;
    }
    .scan-pill {
      display: inline-block;
      font-size: 0.78rem;
      font-weight: 700;
      color: #0f766e;
      background: #ccfbf1;
      border: 1px solid #99f6e4;
      padding: 2mm 4.5mm;
      border-radius: 999px;
      margin: 0 0 7mm;
    }
    .qr-wrap {
      display: inline-block;
      padding: 4mm;
      border-radius: 16px;
      background: #fff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    img.qr {
      width: 58mm;
      height: 58mm;
      max-width: 78vw;
      max-height: 78vw;
      display: block;
      image-rendering: pixelated;
      border-radius: 8px;
    }
    .url-box {
      margin: 7mm auto 0;
      max-width: 100%;
      padding: 3mm 3.5mm;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px dashed #94a3b8;
      text-align: left;
    }
    .url-label {
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 1.5mm;
    }
    .url {
      font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
      font-size: 0.68rem;
      word-break: break-all;
      color: #334155;
      line-height: 1.45;
      margin: 0;
    }
    .hint {
      font-size: 0.78rem;
      line-height: 1.45;
      margin: 6mm 0 0;
      color: #64748b;
      max-width: 130mm;
      margin-left: auto;
      margin-right: auto;
    }
    .footer-line {
      margin: 8mm auto 0;
      height: 1px;
      max-width: 35mm;
      background: linear-gradient(90deg, transparent, #cbd5e1, transparent);
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .sheet {
        box-shadow: none;
        border-radius: 12px;
        max-width: none;
        border: 1px solid #e2e8f0;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand-bar" aria-hidden="true"></div>
    <p class="est-name">${title}</p>
    <div class="mesa-badge" aria-label="Identificação da mesa">${badgeHtml}</div>
    <p class="scan-pill">Aponte a câmera aqui</p>
    <div class="qr-wrap">
      <img class="qr" src="${dataUrl}" alt="QR code do cardápio desta mesa" />
    </div>
    <div class="url-box">
      <p class="url-label">Endereço do cardápio</p>
      <p class="url">${urlText}</p>
    </div>
    <p class="hint">Cardápio digital · faça o pedido pelo celular · em dúvida, chame um atendente.</p>
    <div class="footer-line" aria-hidden="true"></div>
  </div>
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
  const pageH = pdf.internal.pageSize.getHeight();
  const title = establishmentName || "Cardápio na mesa";
  const sub = tableLabel
    ? `Mesa ${tableNumber} — ${tableLabel}`
    : `Mesa ${tableNumber}`;

  pdf.setFillColor(15, 118, 110);
  pdf.rect(0, 0, pageW, 10, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, pageW / 2, 7, { align: "center", maxWidth: pageW - 24 });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(15, 23, 42);

  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text(sub, pageW / 2, 26, { align: "center", maxWidth: pageW - 20 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(13, 148, 136);
  pdf.text("Aponte a câmera do celular no código abaixo", pageW / 2, 33, {
    align: "center",
  });
  pdf.setTextColor(71, 85, 105);

  const imgW = 58;
  const imgH = 58;
  const x = (pageW - imgW) / 2;
  const yImg = 40;
  const pad = 3;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(x - pad, yImg - pad, imgW + pad * 2, imgH + pad * 2, 4, 4, "S");
  pdf.setTextColor(0, 0, 0);
  pdf.addImage(dataUrl, "PNG", x, yImg, imgW, imgH);

  const urlBlockY = yImg + imgH + pad * 2 + 6;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(148, 163, 184);
  pdf.setLineWidth(0.2);
  const boxW = pageW - 28;
  const urlLines = pdf.splitTextToSize(clientUrl, boxW - 6);
  const boxH = Math.max(14, 6 + urlLines.length * 4.2);
  pdf.roundedRect(14, urlBlockY, boxW, boxH, 3, 3, "FD");
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text("ENDEREÇO DO CARDÁPIO", 17, urlBlockY + 4.5);
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text(urlLines, 17, urlBlockY + 9);

  pdf.setFontSize(8.5);
  pdf.setTextColor(100, 116, 139);
  const hintLines = pdf.splitTextToSize(
    "Cardápio digital — pedido pelo celular. Em dúvida, chame um atendente.",
    pageW - 36
  );
  pdf.text(hintLines, pageW / 2, urlBlockY + boxH + 10, { align: "center" });

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.line(pageW / 2 - 22, pageH - 18, pageW / 2 + 22, pageH - 18);

  const safeNum = String(tableNumber).replace(/[^\w-]/g, "") || "mesa";
  pdf.save(`mesa-${safeNum}-qr.pdf`);
}
