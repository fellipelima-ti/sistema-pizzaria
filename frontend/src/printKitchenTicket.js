const THERMAL_PAPER_LS_KEY = "kitchenThermalPaperMm";
const AUTO_PRINTED_IDS_KEY = "pz_kitchen_auto_printed_ids";
const MAX_AUTO_PRINTED_IDS = 500;
const KITCHEN_PRINT_IFRAME_ID = "pz-kitchen-print-frame";

/** Largura do papel térmico usada no próximo comprovante (58mm ou 80mm). */
export function getKitchenThermalPaperMm() {
  try {
    if (typeof localStorage === "undefined") return 80;
    return localStorage.getItem(THERMAL_PAPER_LS_KEY) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export { THERMAL_PAPER_LS_KEY };

/** Evita reimprimir o mesmo pedido ao recarregar ou ao sincronizar de novo. */
export function kitchenAutoPrintWasSent(orderId) {
  const n = Number(orderId);
  const key = Number.isFinite(n) ? n : String(orderId);
  try {
    const raw = localStorage.getItem(AUTO_PRINTED_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return arr.some((x) => x === key || Number(x) === Number(key));
  } catch {
    return false;
  }
}

export function kitchenAutoPrintMarkSent(orderId) {
  const n = Number(orderId);
  const key = Number.isFinite(n) ? n : String(orderId);
  try {
    const raw = localStorage.getItem(AUTO_PRINTED_IDS_KEY);
    let arr = raw ? JSON.parse(raw) : [];
    if (!arr.some((x) => x === key || Number(x) === Number(key))) {
      arr.push(key);
      if (arr.length > MAX_AUTO_PRINTED_IDS) {
        arr = arr.slice(-MAX_AUTO_PRINTED_IDS);
      }
      localStorage.setItem(AUTO_PRINTED_IDS_KEY, JSON.stringify(arr));
    }
  } catch {
    /* ignore */
  }
}

export const KITCHEN_AUTO_PRINT_ENABLED_KEY = "pz_kitchen_auto_print";

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Imprime HTML em iframe oculto (evita bloqueio de pop-up na impressão automática).
 */
function printHtmlInKitchenFrame(html) {
  if (typeof document === "undefined") return;
  let iframe = document.getElementById(KITCHEN_PRINT_IFRAME_ID);
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = KITCHEN_PRINT_IFRAME_ID;
    iframe.setAttribute("title", "Impressão cozinha");
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
  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  setTimeout(runPrint, 120);
}

/**
 * Comprovante para impressora térmica (via driver) ou PDF — diálogo do navegador,
 * exceto se o Chrome/Edge for iniciado com --kiosk-printing (impressora padrão, sem diálogo).
 * Largura: opção "Papel térmico" na aba Cozinha.
 *
 * @param {object} order - pedido com items, customer, table, etc.
 */
export function printKitchenTicket(order) {
  const paperMm = getKitchenThermalPaperMm();
  const bodyMax = paperMm === 58 ? "58mm" : "80mm";
  const baseFont = paperMm === 58 ? "10px" : "11px";
  const h1Size = paperMm === 58 ? "13px" : "15px";

  const customer = escapeHtml(order.customer?.name || "—");
  const phoneLine = order.customer?.phone
    ? escapeHtml(order.customer.phone)
    : "";
  const typeLine = [
    escapeHtml(order.type || ""),
    order.table ? `Mesa ${order.table.number}` : "",
    order.type === "entrega" && order.deliveryAddress
      ? `Entrega: ${escapeHtml(order.deliveryAddress)}`
      : "",
  ]
    .filter(Boolean)
    .join(" — ");

  const itemsRows = (order.items || [])
    .map((i) => {
      const n1 = escapeHtml(i.product?.name || "Item");
      const n2 = i.secondProduct?.name ? escapeHtml(i.secondProduct.name) : "";
      const core = n2 ? `${n1} + ${n2}` : n1;
      const size = i.sizeLabel ? String(i.sizeLabel).trim() : "";
      const name = size ? `${core} (${escapeHtml(size)})` : core;
      const note = i.note ? escapeHtml(i.note) : "—";
      return `<tr><td>${escapeHtml(String(i.quantity))}x</td><td>${name}</td><td>${note}</td></tr>`;
    })
    .join("");

  const created = order.createdAt
    ? new Date(order.createdAt).toLocaleString("pt-BR")
    : "—";

  const qrLine =
    order.orderSource === "qr_mesa"
      ? '<p class="tag">Pedido pelo QR da mesa</p>'
      : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pedido #${order.id}</title>
  <style>
    * { box-sizing: border-box; }
    @page {
      margin: 2mm;
      size: auto;
    }
    body {
      font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
      padding: 3mm;
      max-width: ${bodyMax};
      width: ${bodyMax};
      margin: 0 auto;
      font-size: ${baseFont};
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    h1 {
      font-family: inherit;
      font-size: ${h1Size};
      margin: 0 0 4px;
      padding-bottom: 4px;
      border-bottom: 2px dashed #000;
      font-weight: 800;
    }
    .rule {
      border: none;
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .muted { color: #222; font-size: 0.95em; margin: 3px 0; word-break: break-word; }
    .tag {
      border: 1px solid #000;
      padding: 3px 6px;
      font-size: 0.88em;
      font-weight: 700;
      margin: 6px 0;
      display: inline-block;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th {
      text-align: left;
      font-size: 0.82em;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding: 3px 4px 3px 0;
      font-weight: 700;
    }
    td { padding: 5px 4px 5px 0; vertical-align: top; border-bottom: 1px dotted #999; font-size: 1em; }
    td:first-child { white-space: nowrap; width: 2em; font-weight: 700; }
    .total { margin-top: 10px; font-size: 1.1em; font-weight: 800; border-top: 2px dashed #000; padding-top: 6px; }
    .foot {
      margin-top: 10px;
      font-size: 0.85em;
      color: #333;
      text-align: center;
    }
    @media print {
      body { padding: 1mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="no-print muted" style="margin-top:0">
    Pré-visualização — na bobina só saem os itens abaixo desta linha no modo impressão.
  </p>
  <h1>#${order.id} · Cozinha</h1>
  <p class="muted"><strong>${customer}</strong>${phoneLine ? ` · ${phoneLine}` : ""}</p>
  <p class="muted">${typeLine || "—"}</p>
  ${qrLine}
  <p class="muted">Status: ${escapeHtml(order.status || "—")} · ${created}</p>
  ${
    order.note
      ? `<p><strong>Obs. pedido:</strong> ${escapeHtml(order.note)}</p>`
      : ""
  }
  <hr class="rule" />
  <table>
    <thead><tr><th>Qtd</th><th>Item</th><th>Obs.</th></tr></thead>
    <tbody>${
      itemsRows ||
      '<tr><td colspan="3">Sem itens</td></tr>'
    }</tbody>
  </table>
  ${
    order.type === "entrega" && Number(order.deliveryFee || 0) > 0
      ? `<p class="muted">Taxa de entrega: R$ ${Number(order.deliveryFee).toFixed(2)}</p>`
      : ""
  }
  <p class="total">Total: R$ ${Number(order.total || 0).toFixed(2)}</p>
  <p class="foot">—</p>
</body>
</html>`;

  printHtmlInKitchenFrame(html);
}
