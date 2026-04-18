import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { API_URL } from "./apiConfig";
import {
  getEnvPublicOrigin,
  isLoopbackHost,
  mesaPublicUrl,
  resolveQrPublicOrigin,
  setStoredPublicOrigin,
} from "./publicOrigin";
import {
  cartLineKey,
  groupProductsByCategory,
  isHalfHalfSizeLabel,
  productHasSizes,
  productSizesPriceSummary,
  unitPriceForCartLine,
} from "./productUtils";
import {
  printKitchenTicket,
  THERMAL_PAPER_LS_KEY,
  kitchenAutoPrintWasSent,
  kitchenAutoPrintMarkSent,
  KITCHEN_AUTO_PRINT_ENABLED_KEY,
} from "./printKitchenTicket";
import { printTableQrLabel, downloadTableQrPdf } from "./printTableQr";
import { productImageSrc } from "./productImageUrl";
import {
  establishmentLogoSrc,
  fetchPublicEstablishment,
} from "./establishmentApi";
import AnalyticsDashboard from "./AnalyticsDashboard.jsx";
import "./App.css";
const ORDER_STATUS = ["novo", "preparo", "entrega", "finalizado"];
const PAYMENT_METHODS = ["dinheiro", "pix", "cartao"];
/** Sugestoes de categoria — pode digitar qualquer outra no campo. */
const MENU_CATEGORY_PRESETS = [
  "pizza",
  "pastel",
  "bebidas",
  "lanches",
  "porcoes",
  "salgados",
  "sobremesa",
  "acompanhamento",
  "combo",
  "outros",
];

const DEFAULT_MENU_CATEGORY = "outros";

const TABS = [
  { id: "inicio", label: "Início" },
  { id: "dashboard", label: "Dashboard" },
  { id: "mesas", label: "Mesas" },
  { id: "novo", label: "Novo pedido" },
  { id: "cardapio", label: "Cardápio" },
  { id: "cozinha", label: "Cozinha" },
  { id: "caixa", label: "Financeiro" },
  { id: "pedidos", label: "Pedidos" },
  { id: "relatorios", label: "Relatórios" },
  { id: "cadastros", label: "Cadastros" },
];

const USER_ROLES = ["admin", "caixa", "cozinha", "garcom"];

const TAB_ACCESS = {
  inicio: USER_ROLES,
  dashboard: ["admin"],
  mesas: ["admin", "caixa", "garcom"],
  novo: ["admin", "caixa", "garcom"],
  cardapio: ["admin"],
  cozinha: ["admin", "cozinha"],
  caixa: ["admin"],
  pedidos: ["admin", "caixa", "garcom"],
  relatorios: ["admin"],
  cadastros: ["admin"],
};

const ROLE_LABELS = {
  admin: "Administrador (dono)",
  caixa: "Atendimento",
  cozinha: "Cozinha",
  garcom: "Garçom",
};

function mergeEstablishmentFromApi(prev, row) {
  const next = { ...(prev || {}) };
  if (row.tradeName !== undefined) next.tradeName = row.tradeName;
  if (row.logoUrl !== undefined) next.logoUrl = row.logoUrl;
  if (row.deliveryFeeDefault !== undefined) {
    next.deliveryFeeDefault = row.deliveryFeeDefault;
  }
  if (row.pixChave !== undefined) next.pixChave = row.pixChave;
  if (row.pixNomeRecebedor !== undefined) {
    next.pixNomeRecebedor = row.pixNomeRecebedor;
  }
  return next;
}

const LS_TOKEN = "pz_token";
const LS_USER_NAME = "pz_userName";
const LS_USER_ROLE = "pz_userRole";

function readStoredSession() {
  const t = localStorage.getItem(LS_TOKEN);
  const name = localStorage.getItem(LS_USER_NAME);
  const role = localStorage.getItem(LS_USER_ROLE);
  if (!t && !name && !role) {
    return { token: "", userName: "", userRole: "" };
  }
  if (!t || !name || !role || !USER_ROLES.includes(role)) {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER_NAME);
    localStorage.removeItem(LS_USER_ROLE);
    return { token: "", userName: "", userRole: "" };
  }
  return { token: t, userName: name, userRole: role };
}

function normalizeRole(role) {
  return role && USER_ROLES.includes(role) ? role : "admin";
}

function roleCanAccessTab(role, tabId) {
  const r = normalizeRole(role);
  return (TAB_ACCESS[tabId] || USER_ROLES).includes(r);
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(() => readStoredSession().token);
  const [userName, setUserName] = useState(() => readStoredSession().userName);
  const [userRole, setUserRole] = useState(() => readStoredSession().userRole);
  const [activeTab, setActiveTab] = useState("inicio");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);

  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("");
  const [newProductImageUrl, setNewProductImageUrl] = useState(null);
  const [newProductAvailable, setNewProductAvailable] = useState(true);
  /** Tamanhos do novo produto: { label, price } — opcional (ex.: pizzas). */
  const [newProductSizes, setNewProductSizes] = useState([]);
  const [menuEdit, setMenuEdit] = useState(null);
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [reportDateTo, setReportDateTo] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableLabel, setNewTableLabel] = useState("");
  const [createTableBusy, setCreateTableBusy] = useState(false);

  const [staffUsers, setStaffUsers] = useState([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("garcom");
  const [editingStaffId, setEditingStaffId] = useState(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [orderType, setOrderType] = useState("balcao");
  const [deliveryPhoneDraft, setDeliveryPhoneDraft] = useState("");
  const [deliveryAddressDraft, setDeliveryAddressDraft] = useState("");
  const [deliveryFeeAdminDraft, setDeliveryFeeAdminDraft] = useState("0");
  const [ordersTypeFilter, setOrdersTypeFilter] = useState("todos");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [cartItems, setCartItems] = useState([]);

  const [kitchenFilter, setKitchenFilter] = useState("todos");
  const [kitchenThermalPaperMm, setKitchenThermalPaperMm] = useState(() => {
    try {
      return localStorage.getItem(THERMAL_PAPER_LS_KEY) === "58" ? "58" : "80";
    } catch {
      return "80";
    }
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [kitchenAutoPrint, setKitchenAutoPrint] = useState(() => {
    try {
      return localStorage.getItem(KITCHEN_AUTO_PRINT_ENABLED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const kitchenAutoPrintBaselineRef = useRef(null);
  const [lastKitchenSync, setLastKitchenSync] = useState("");

  const [financeDate, setFinanceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [financeSummary, setFinanceSummary] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [cashCurrent, setCashCurrent] = useState(null);
  const [cashShifts, setCashShifts] = useState([]);
  const [tableDiscountClosures, setTableDiscountClosures] = useState([]);
  const [cashOpenBalance, setCashOpenBalance] = useState("0");
  const [cashOpenNote, setCashOpenNote] = useState("");
  const [cashCloseBalance, setCashCloseBalance] = useState("");
  const [cashCloseNote, setCashCloseNote] = useState("");
  const [closeTableModal, setCloseTableModal] = useState(null);
  const [closeTablePaymentMethod, setCloseTablePaymentMethod] = useState("pix");
  const [closeTableSubmitting, setCloseTableSubmitting] = useState(false);
  const [closeTableDiscount, setCloseTableDiscount] = useState("0");
  const [closeTableDiscountPercent, setCloseTableDiscountPercent] = useState("0");
  const [closeTableSurcharge, setCloseTableSurcharge] = useState("0");
  const [closeTableDiscountReason, setCloseTableDiscountReason] = useState("");

  const [message, setMessage] = useState("");

  const [establishment, setEstablishment] = useState(null);
  const [brandNameDraft, setBrandNameDraft] = useState("");
  const [pixChaveDraft, setPixChaveDraft] = useState("");
  const [pixNomeRecebedorDraft, setPixNomeRecebedorDraft] = useState("");
  const [logoDraftFile, setLogoDraftFile] = useState(null);
  const [logoDraftPreviewUrl, setLogoDraftPreviewUrl] = useState("");
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [logoCropMeta, setLogoCropMeta] = useState(null);
  const [logoCropZoom, setLogoCropZoom] = useState(1);
  const [logoCropOffset, setLogoCropOffset] = useState({ x: 0, y: 0 });
  const [logoCropDrag, setLogoCropDrag] = useState(null);

  const [qrLinkBase, setQrLinkBase] = useState(() => resolveQrPublicOrigin());
  const [qrLinkDraft, setQrLinkDraft] = useState("");

  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const displayTradeName = establishment?.tradeName?.trim() || "Pizzaria";
  const hasEstablishmentLogo = Boolean(establishment?.logoUrl && !logoLoadFailed);

  async function refreshEstablishment() {
    const d = await fetchPublicEstablishment();
    setEstablishment(d);
    if (d.tradeName) setBrandNameDraft(d.tradeName);
    setPixChaveDraft(d.pixChave || "");
    setPixNomeRecebedorDraft(d.pixNomeRecebedor || "");
  }

  useEffect(() => {
    refreshEstablishment();
  }, []);

  useEffect(() => {
    document.title = establishment?.tradeName
      ? `${establishment.tradeName} — Gestão`
      : "Gestão — Pizzaria";
  }, [establishment?.tradeName]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [establishment?.logoUrl]);

  useEffect(() => {
    if (!logoDraftFile) {
      setLogoDraftPreviewUrl("");
      setLogoCropMeta(null);
      return;
    }
    const url = URL.createObjectURL(logoDraftFile);
    setLogoDraftPreviewUrl(url);
    setLogoCropZoom(1);
    setLogoCropOffset({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () =>
      setLogoCropMeta({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [logoDraftFile]);

  useEffect(() => {
    if (!logoCropMeta) return;
    const zoom = Math.max(1, Number(logoCropZoom || 1));
    const minSide = Math.min(logoCropMeta.width, logoCropMeta.height);
    const cropSize = minSide / zoom;
    const maxX = Math.max(0, (logoCropMeta.width - cropSize) / 2);
    const maxY = Math.max(0, (logoCropMeta.height - cropSize) / 2);
    setLogoCropOffset((prev) => ({
      x: Math.min(maxX, Math.max(-maxX, Number(prev?.x || 0))),
      y: Math.min(maxY, Math.max(-maxY, Number(prev?.y || 0))),
    }));
  }, [logoCropMeta, logoCropZoom]);

  useEffect(() => {
    if (!logoCropDrag) return;
    function onMouseMove(e) {
      if (!logoCropMeta) return;
      const minSide = Math.min(logoCropMeta.width, logoCropMeta.height);
      const previewSize = 140;
      const baseScale = previewSize / minSide;
      const factor = baseScale * logoCropZoom;
      if (!factor) return;
      const dxPx = e.clientX - logoCropDrag.startX;
      const dyPx = e.clientY - logoCropDrag.startY;
      const nextX = logoCropDrag.originX - dxPx / factor;
      const nextY = logoCropDrag.originY - dyPx / factor;
      setLogoCropOffset({ x: nextX, y: nextY });
    }
    function onMouseUp() {
      setLogoCropDrag(null);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [logoCropDrag, logoCropMeta, logoCropZoom]);

  useEffect(() => {
    if (!logoCropDrag) return;
    function onTouchMove(e) {
      if (!logoCropMeta) return;
      const touch = e.touches?.[0];
      if (!touch) return;
      const minSide = Math.min(logoCropMeta.width, logoCropMeta.height);
      const previewSize = 140;
      const baseScale = previewSize / minSide;
      const factor = baseScale * logoCropZoom;
      if (!factor) return;
      const dxPx = touch.clientX - logoCropDrag.startX;
      const dyPx = touch.clientY - logoCropDrag.startY;
      const nextX = logoCropDrag.originX - dxPx / factor;
      const nextY = logoCropDrag.originY - dyPx / factor;
      setLogoCropOffset({ x: nextX, y: nextY });
    }
    function onTouchEnd() {
      setLogoCropDrag(null);
    }
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [logoCropDrag, logoCropMeta, logoCropZoom]);

  const visibleTabs = useMemo(
    () => TABS.filter((t) => roleCanAccessTab(userRole, t.id)),
    [userRole]
  );

  const role = normalizeRole(userRole);
  /** Dono: pagamentos, turno, relatórios */
  const managesFinance = role === "admin";
  const canRegisterPayment = managesFinance;
  /** Fechar comanda da mesa (pagamento no salão): admin, caixa e garçom — com caixa aberto (API). */
  const canCloseTableCheckout = ["admin", "caixa", "garcom"].includes(role);
  const canChangeOrderStatus = ["admin", "caixa", "cozinha", "garcom"].includes(
    role
  );
  /** Ver se o turno está aberto (para registrar pedido no balcão) */
  const seesCashRegisterStatus = ["admin", "caixa", "garcom"].includes(role);
  /** Imprimir comprovante / cozinha na aba Pedidos (térmica via navegador) */
  const canPrintOrderTicket = ["admin", "caixa", "garcom"].includes(role);

  const occupiedTablesCount = useMemo(
    () => tables.filter((t) => t.openOrders?.length > 0).length,
    [tables]
  );
  const closeTableOrders = useMemo(
    () => (Array.isArray(closeTableModal?.openOrders) ? closeTableModal.openOrders : []),
    [closeTableModal]
  );
  const closeTableTotal = useMemo(
    () =>
      Number(
        closeTableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2)
      ),
    [closeTableOrders]
  );
  const closeTableDiscountValue = useMemo(
    () => Math.max(0, Number(closeTableDiscount || 0)),
    [closeTableDiscount]
  );
  const closeTableSurchargeValue = useMemo(
    () => Math.max(0, Number(closeTableSurcharge || 0)),
    [closeTableSurcharge]
  );
  const closeTableDiscountPercentValue = useMemo(() => {
    const n = Math.max(0, Number(closeTableDiscountPercent || 0));
    return Number.isFinite(n) ? Math.min(100, n) : 0;
  }, [closeTableDiscountPercent]);
  const closeTablePercentDiscountValue = useMemo(
    () => Number(((closeTableTotal * closeTableDiscountPercentValue) / 100).toFixed(2)),
    [closeTableTotal, closeTableDiscountPercentValue]
  );
  const closeTableTotalDiscount = useMemo(
    () => Number((closeTableDiscountValue + closeTablePercentDiscountValue).toFixed(2)),
    [closeTableDiscountValue, closeTablePercentDiscountValue]
  );
  const closeTableNetTotal = useMemo(
    () =>
      Number(
        Math.max(0, closeTableTotal - closeTableTotalDiscount + closeTableSurchargeValue).toFixed(2)
      ),
    [closeTableTotal, closeTableTotalDiscount, closeTableSurchargeValue]
  );

  useEffect(() => {
    if (orderType !== "mesa") setSelectedTableId("");
  }, [orderType]);

  useEffect(() => {
    const c = customers.find((x) => String(x.id) === String(selectedCustomerId));
    if (c) {
      setDeliveryPhoneDraft(c.phone || "");
      setDeliveryAddressDraft(c.address || "");
    } else {
      setDeliveryPhoneDraft("");
      setDeliveryAddressDraft("");
    }
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    if (establishment?.deliveryFeeDefault != null) {
      setDeliveryFeeAdminDraft(String(establishment.deliveryFeeDefault));
    }
  }, [establishment?.deliveryFeeDefault]);

  useEffect(() => {
    if (!token || !userRole) return;
    if (!roleCanAccessTab(userRole, activeTab)) {
      const next =
        TABS.find((t) => roleCanAccessTab(userRole, t.id))?.id || "inicio";
      setActiveTab(next);
    }
  }, [token, userRole, activeTab]);

  useEffect(() => {
    if (activeTab !== "mesas") return;
    setQrLinkDraft(qrLinkBase || "");
  }, [activeTab, qrLinkBase]);

  function saveQrLinkBase() {
    const raw = qrLinkDraft.trim();
    if (!raw) {
      setStoredPublicOrigin("");
      setQrLinkBase("");
      setMessage("Link do cardápio limpo. Informe um endereço para o celular abrir.");
      return;
    }
    let parsed;
    try {
      parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    } catch {
      setMessage("Endereço inválido. Ex: http://192.168.0.15:5173");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setMessage("Use http ou https.");
      return;
    }
    const base = parsed.origin;
    setStoredPublicOrigin(base);
    setQrLinkBase(base);
    setQrLinkDraft(base);
    setMessage("Link salvo. Gere o código de novo e teste no celular.");
  }

  const qrLinkConfigured = Boolean(qrLinkBase);
  const showQrLocalhostHelp =
    isLoopbackHost() && !getEnvPublicOrigin();

  async function handleLogin(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setMessage("Falha no login.");
      return;
    }

    const data = await response.json();
    const nextRole = normalizeRole(data.user?.role);
    localStorage.setItem(LS_TOKEN, data.token);
    localStorage.setItem(LS_USER_NAME, data.user.name);
    localStorage.setItem(LS_USER_ROLE, nextRole);
    setToken(data.token);
    setUserName(data.user.name);
    setUserRole(nextRole);
    const firstTab =
      TABS.find((t) => roleCanAccessTab(nextRole, t.id))?.id || "inicio";
    setActiveTab(firstTab);
    setMessage(`Bem-vindo, ${data.user.name}.`);
    await refreshEstablishment();
    await loadDeliveryFeeDefault(data.token);
  }

  async function loadDeliveryFeeDefault(customToken = token) {
    const response = await fetch(`${API_URL}/settings/delivery-fee`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) return;
    const row = await response.json();
    setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
  }

  async function loadAdminEstablishmentSettings(customToken = token) {
    if (!customToken || normalizeRole(userRole) !== "admin") return;
    const response = await fetch(`${API_URL}/settings/establishment`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) return;
    const row = await response.json();
    setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
    if (row.tradeName) setBrandNameDraft(row.tradeName);
    setPixChaveDraft(row.pixChave || "");
    setPixNomeRecebedorDraft(row.pixNomeRecebedor || "");
  }

  async function requestRecoveryCode(event) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/auth/recovery/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: recoveryEmail.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message || "Falha ao solicitar código.");
      return;
    }
    if (data.devCode && import.meta.env.DEV) {
      setMessage(`Código (somente ambiente de testes): ${data.devCode}`);
      return;
    }
    setMessage(data.message || "Código de recuperação solicitado.");
  }

  async function confirmRecovery(event) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/auth/recovery/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: recoveryEmail.trim(),
        code: recoveryCode.trim(),
        newPassword: recoveryNewPassword,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message || "Falha ao redefinir senha.");
      return;
    }
    setRecoveryCode("");
    setRecoveryNewPassword("");
    setPassword("");
    setMessage(data.message || "Senha redefinida. Faça login com a nova senha.");
  }

  function handleLogout() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER_NAME);
    localStorage.removeItem(LS_USER_ROLE);
    setToken("");
    setUserName("");
    setUserRole("");
    setStaffUsers([]);
    resetStaffForm();
    setMessage("Sessão encerrada.");
  }

  async function loadProducts(customToken = token) {
    const response = await fetch(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) {
      if (response.status !== 403) {
        setMessage("Não foi possível carregar produtos.");
      }
      return;
    }
    setProducts(await response.json());
  }

  async function loadCustomers(customToken = token) {
    const response = await fetch(`${API_URL}/customers`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) {
      if (response.status !== 403) {
        setMessage("Não foi possível carregar clientes.");
      }
      return;
    }
    const data = await response.json();
    setCustomers(data);
    if (data.length && !selectedCustomerId) {
      setSelectedCustomerId(String(data[0].id));
    }
  }

  async function loadTables(customToken = token) {
    const response = await fetch(`${API_URL}/tables`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) return;
    setTables(await response.json());
  }

  async function handlePrintTableQr(table, clientPath) {
    if (!clientPath) {
      setMessage("Configure o link do cardápio para imprimir o QR desta mesa.");
      return;
    }
    try {
      await printTableQrLabel({
        clientUrl: clientPath,
        tableNumber: table.number,
        tableLabel: table.label,
        establishmentName: displayTradeName,
      });
    } catch {
      setMessage("Não foi possível preparar a impressão do QR.");
    }
  }

  async function handleDownloadTableQrPdf(table, clientPath) {
    if (!clientPath) {
      setMessage("Configure o link do cardápio para gerar o PDF desta mesa.");
      return;
    }
    try {
      await downloadTableQrPdf({
        clientUrl: clientPath,
        tableNumber: table.number,
        tableLabel: table.label,
        establishmentName: displayTradeName,
      });
      setMessage(`PDF da mesa ${table.number} baixado.`);
    } catch {
      setMessage("Não foi possível gerar o PDF do QR.");
    }
  }

  async function loadOrders(customToken = token) {
    const response = await fetch(`${API_URL}/orders`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) {
      setMessage("Não foi possível carregar pedidos.");
      return;
    }
    setOrders(await response.json());
    setLastKitchenSync(new Date().toLocaleTimeString("pt-BR"));
  }

  async function loadFinanceSummary(customDate = financeDate, customToken = token) {
    const response = await fetch(`${API_URL}/finance/summary?date=${customDate}`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) {
      if (response.status !== 403) {
        setMessage("Não foi possível carregar resumo financeiro.");
      }
      return;
    }
    setFinanceSummary(await response.json());
  }

  async function loadAnalytics(customDays = analyticsDays, customToken = token) {
    if (!customToken || normalizeRole(userRole) !== "admin") return;
    setAnalyticsLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/finance/analytics?days=${customDays}`,
        { headers: { Authorization: `Bearer ${customToken}` } }
      );
      if (!response.ok) {
        setAnalyticsData(null);
        return;
      }
      setAnalyticsData(await response.json());
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadCashCurrent(customToken = token) {
    const response = await fetch(`${API_URL}/cash/current`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) {
      if (response.status !== 403) {
        setMessage("Não foi possível carregar estado do caixa.");
      }
      if (response.status === 403) setCashCurrent(null);
      return;
    }
    setCashCurrent(await response.json());
  }

  async function loadCashShifts(customToken = token) {
    const response = await fetch(`${API_URL}/cash/shifts?limit=10`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) return;
    setCashShifts(await response.json());
  }

  async function loadTableDiscountClosures(customToken = token) {
    const response = await fetch(`${API_URL}/finance/table-checkout-discounts?limit=20`, {
      headers: { Authorization: `Bearer ${customToken}` },
    });
    if (!response.ok) return;
    setTableDiscountClosures(await response.json());
  }

  useEffect(() => {
    if (!token || !userRole) return;
    const r = normalizeRole(userRole);
    let cancelled = false;
    const t = token;
    const dateSnapshot = financeDate;
    (async () => {
      if (["admin", "caixa", "garcom"].includes(r) && !cancelled) {
        await loadProducts(t);
      }
      if (["admin", "caixa", "garcom"].includes(r) && !cancelled) {
        await loadCustomers(t);
      }
      if (["admin", "caixa", "garcom"].includes(r) && !cancelled) {
        await loadTables(t);
      }
      if (!cancelled) await loadOrders(t);
      if (["admin", "caixa", "garcom"].includes(r) && !cancelled) {
        await loadCashCurrent(t);
      }
      if (["admin", "caixa", "garcom"].includes(r) && !cancelled) {
        await loadDeliveryFeeDefault(t);
      }
      if (r === "admin" && !cancelled) {
        await loadFinanceSummary(dateSnapshot, t);
        await loadCashShifts(t);
        await loadTableDiscountClosures(t);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, userRole]);

  const loadStaffUsers = useCallback(
    async (customToken = token) => {
      const response = await fetch(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${customToken}` },
      });
      if (!response.ok) return;
      setStaffUsers(await response.json());
    },
    [token]
  );

  useEffect(() => {
    if (!token || activeTab !== "cadastros" || normalizeRole(userRole) !== "admin")
      return;
    loadStaffUsers();
    loadAdminEstablishmentSettings(token);
  }, [token, activeTab, userRole, loadStaffUsers]);

  function startEditStaffUser(userRow) {
    setEditingStaffId(userRow.id);
    setNewStaffName(userRow.name || "");
    setNewStaffEmail(userRow.email || "");
    setNewStaffPassword("");
    setNewStaffRole(userRow.role || "garcom");
  }

  function resetStaffForm() {
    setEditingStaffId(null);
    setNewStaffName("");
    setNewStaffEmail("");
    setNewStaffPassword("");
    setNewStaffRole("garcom");
  }

  async function saveStaffUser(event) {
    event.preventDefault();
    const isEdit = Boolean(editingStaffId);
    const payload = {
      name: newStaffName.trim(),
      email: newStaffEmail.trim(),
      role: newStaffRole,
    };
    if (!isEdit || newStaffPassword) {
      payload.password = newStaffPassword;
    }
    const response = await fetch(
      isEdit ? `${API_URL}/users/${editingStaffId}` : `${API_URL}/users`,
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || (isEdit ? "Falha ao editar usuário." : "Falha ao criar usuário."));
      return;
    }
    resetStaffForm();
    setMessage(isEdit ? "Usuário atualizado." : "Usuário cadastrado.");
    loadStaffUsers();
  }

  async function toggleStaffUserActive(userRow) {
    const nextActive = !userRow.active;
    const actionLabel = nextActive ? "ativar" : "desativar";
    if (!window.confirm(`Deseja ${actionLabel} o usuário ${userRow.name}?`)) return;
    const response = await fetch(`${API_URL}/users/${userRow.id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || `Falha ao ${actionLabel} usuário.`);
      return;
    }
    setMessage(nextActive ? "Usuário ativado." : "Usuário desativado.");
    loadStaffUsers();
  }

  async function generateStaffRecoveryCode(userRow) {
    const response = await fetch(`${API_URL}/users/${userRow.id}/recovery-code`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message || "Falha ao gerar código de recuperação.");
      return;
    }
    setMessage(
      `Código de ${userRow.name}: ${data.code} (expira em ${data.expiresInMinutes} min).`
    );
  }

  async function saveEstablishmentBrandingName(e) {
    e.preventDefault();
    const t = brandNameDraft.trim();
    if (!t || t.length > 120) {
      setMessage("Nome inválido (1 a 120 caracteres).");
      return;
    }
    const response = await fetch(`${API_URL}/settings/establishment`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ tradeName: t }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Não foi possível salvar o nome.");
      return;
    }
    const row = await response.json();
    setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
    setMessage("Nome do estabelecimento atualizado.");
  }

  async function saveEstablishmentPix(e) {
    e.preventDefault();
    const response = await fetch(`${API_URL}/settings/establishment`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        pixChave: pixChaveDraft.trim(),
        pixNomeRecebedor: pixNomeRecebedorDraft.trim(),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Não foi possível salvar o Pix.");
      return;
    }
    const row = await response.json();
    setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
    setMessage("Chave Pix atualizada.");
  }

  async function saveDeliveryFeeDefault(e) {
    e.preventDefault();
    const n = Number(String(deliveryFeeAdminDraft).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 99999) {
      setMessage("Taxa de entrega inválida.");
      return;
    }
    const response = await fetch(`${API_URL}/settings/establishment`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryFeeDefault: Number(n.toFixed(2)) }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Não foi possível salvar a taxa.");
      return;
    }
    const row = await response.json();
    setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
    setDeliveryFeeAdminDraft(String(row.deliveryFeeDefault ?? 0));
    setMessage("Taxa de entrega atualizada.");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
      r.readAsDataURL(file);
    });
  }

  async function uploadEstablishmentLogo(file) {
    if (!file) return;
    setLogoUploadBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch(`${API_URL}/settings/establishment-logo-data`, {
        method: "POST",
        headers: {
          Authorization: authHeader.Authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dataUrl }),
      });
      const rawText = await response.text();
      let row = {};
      try {
        row = rawText ? JSON.parse(rawText) : {};
      } catch {
        row = {};
      }
      if (!response.ok) {
        const hint =
          typeof row.message === "string" && row.message.length > 0
            ? row.message
            : "Não foi possível enviar a logo. Verifique sua conexão ou tente outra imagem.";
        setMessage(hint);
        return;
      }
      setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
      setLogoDraftFile(null);
      setLogoCropMeta(null);
      setLogoCropZoom(1);
      setLogoCropOffset({ x: 0, y: 0 });
      setMessage("Logo atualizada.");
    } catch {
      setMessage(
        "Não foi possível enviar a logo. Verifique a internet e tente novamente."
      );
    } finally {
      setLogoUploadBusy(false);
    }
  }

  async function cropLogoToSquare(file) {
    if (!file) return null;
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = objectUrl;
      });
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const cropSide = side / Math.max(1, Number(logoCropZoom || 1));
      const centerX = image.naturalWidth / 2 + Number(logoCropOffset?.x || 0);
      const centerY = image.naturalHeight / 2 + Number(logoCropOffset?.y || 0);
      const sx = Math.max(
        0,
        Math.min(image.naturalWidth - cropSide, Math.floor(centerX - cropSide / 2))
      );
      const sy = Math.max(
        0,
        Math.min(image.naturalHeight - cropSide, Math.floor(centerY - cropSide / 2))
      );
      const canvas = document.createElement("canvas");
      const outputSize = 512;
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, sx, sy, cropSide, cropSide, 0, 0, outputSize, outputSize);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.92)
      );
      if (!blob) return file;
      return new File([blob], "logo-cropped.png", { type: "image/png" });
    } catch {
      return file;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function confirmLogoUpload() {
    if (!logoDraftFile || logoUploadBusy) return;
    try {
      const maxBytes = 2.5 * 1024 * 1024;
      const fileToSend = logoDraftFile;
      if (fileToSend.size > maxBytes) {
        setMessage("Arquivo muito grande (máximo 2,5 MB).");
        return;
      }
      const cropped = await cropLogoToSquare(logoDraftFile);
      await uploadEstablishmentLogo(cropped || logoDraftFile);
    } catch (e) {
      setMessage(
        e?.message ||
          "Não foi possível processar a imagem. Tente JPG ou PNG de outro aparelho."
      );
    }
  }

  function cancelLogoDraft() {
    if (logoUploadBusy) return;
    setLogoDraftFile(null);
    setLogoCropMeta(null);
    setLogoCropZoom(1);
    setLogoCropOffset({ x: 0, y: 0 });
    setLogoCropDrag(null);
  }

  async function removeEstablishmentLogo() {
    if (!establishment?.logoUrl) return;
    if (!window.confirm("Remover a logo do estabelecimento?")) return;
    const response = await fetch(`${API_URL}/settings/establishment`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ clearLogo: true }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Não foi possível remover a logo.");
      return;
    }
    const row = await response.json();
    setEstablishment((prev) => mergeEstablishmentFromApi(prev, row));
    setMessage("Logo removida.");
  }

  async function openCash() {
    const response = await fetch(`${API_URL}/cash/open`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        openingBalance: Number(cashOpenBalance || 0),
        openNote: cashOpenNote || null,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao abrir caixa.");
      return;
    }
    setCashOpenNote("");
    setCashOpenBalance("0");
    setMessage("Caixa aberto.");
    loadCashCurrent();
    loadCashShifts();
  }

  async function closeCash() {
    const response = await fetch(`${API_URL}/cash/close`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        closingBalance:
          cashCloseBalance === "" ? null : Number(cashCloseBalance),
        closeNote: cashCloseNote || null,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao fechar caixa.");
      return;
    }
    setCashCloseBalance("");
    setCashCloseNote("");
    setMessage("Caixa fechado. Resumo salvo.");
    setCashCurrent(null);
    loadCashShifts();
    loadFinanceSummary();
  }

  async function uploadProductPhoto(file) {
    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch(`${API_URL}/uploads/product-image`, {
      method: "POST",
      headers: { Authorization: authHeader.Authorization },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Falha no envio da foto.");
    }
    return res.json();
  }

  async function createProduct(event) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProductName,
        price: Number(newProductPrice),
        category:
          (newProductCategory || "").trim() || DEFAULT_MENU_CATEGORY,
        imageUrl: newProductImageUrl || null,
        available: newProductAvailable,
        sizes: newProductSizes
          .map((r) => ({
            label: String(r.label || "").trim(),
            price: Number(r.price),
          }))
          .filter((r) => r.label && Number.isFinite(r.price) && r.price >= 0),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao criar produto.");
      return;
    }
    setNewProductName("");
    setNewProductPrice("");
    setNewProductCategory("");
    setNewProductImageUrl(null);
    setNewProductAvailable(true);
    setNewProductSizes([]);
    setMessage("Produto criado com sucesso.");
    loadProducts();
  }

  async function saveMenuEdit(event) {
    event.preventDefault();
    if (!menuEdit) return;
    const response = await fetch(`${API_URL}/products/${menuEdit.id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: menuEdit.name.trim(),
        price: Number(menuEdit.price),
        category:
          (menuEdit.category || "").trim() || DEFAULT_MENU_CATEGORY,
        imageUrl: menuEdit.imageUrl,
        available: menuEdit.available !== false,
        sizes: (Array.isArray(menuEdit.sizes) ? menuEdit.sizes : [])
          .map((r) => ({
            label: String(r.label || "").trim(),
            price: Number(r.price),
          }))
          .filter((r) => r.label && Number.isFinite(r.price) && r.price >= 0),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao salvar produto.");
      return;
    }
    setMenuEdit(null);
    setMessage("Produto atualizado.");
    loadProducts();
  }

  async function deleteMenuProduct(id) {
    if (!window.confirm("Excluir este item do cardápio?")) return;
    const response = await fetch(`${API_URL}/products/${id}`, {
      method: "DELETE",
      headers: { ...authHeader },
    });
    if (response.status === 204) {
      setMenuEdit((e) => (e && e.id === id ? null : e));
      setMessage("Produto excluído.");
      loadProducts();
      return;
    }
    const err = await response.json().catch(() => ({}));
    setMessage(err.message || "Não foi possível excluir.");
  }

  async function toggleProductAvailable(p) {
    const next = p.available === false;
    const res = await fetch(`${API_URL}/products/${p.id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ available: next }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err.message || "Falha ao atualizar disponibilidade.");
      return;
    }
    setMenuEdit((m) =>
      m && m.id === p.id ? { ...m, available: next } : m
    );
    setMessage(
      next
        ? `${p.name} disponível para venda.`
        : `${p.name} indisponível (cardápio do celular e novo pedido).`
    );
    loadProducts();
  }

  async function downloadOrdersCsv() {
    const url = `${API_URL}/reports/orders-csv?from=${encodeURIComponent(
      reportDateFrom
    )}&to=${encodeURIComponent(reportDateTo)}`;
    const res = await fetch(url, { headers: { ...authHeader } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err.message || "Falha ao gerar CSV.");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos_${reportDateFrom}_${reportDateTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage("CSV baixado. Abra no Excel ou Planilhas.");
  }

  async function createCustomer(event) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/customers`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCustomerName,
        phone: newCustomerPhone,
        address: newCustomerAddress,
      }),
    });
    if (!response.ok) {
      setMessage("Falha ao criar cliente.");
      return;
    }
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setMessage("Cliente criado com sucesso.");
    loadCustomers();
  }

  async function createTable(event) {
    event.preventDefault();
    const n = Number(String(newTableNumber).trim());
    if (!Number.isFinite(n) || n < 1 || n > 9999) {
      setMessage("Informe um número de mesa entre 1 e 9999.");
      return;
    }
    setCreateTableBusy(true);
    try {
      const response = await fetch(`${API_URL}/tables`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          number: n,
          label: String(newTableLabel || "").trim() || null,
        }),
      });
      const err = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(err.message || "Falha ao criar mesa.");
        return;
      }
      setNewTableNumber("");
      setNewTableLabel("");
      setMessage("Mesa cadastrada.");
      await loadTables();
    } finally {
      setCreateTableBusy(false);
    }
  }

  async function attendServiceRequest(requestId) {
    const response = await fetch(`${API_URL}/table-service-requests/${requestId}/attend`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao marcar solicitação como atendida.");
      return;
    }
    setMessage(
      "Solicitação atendida. Se era fechamento, o QR da mesa foi bloqueado até o atendimento liberar novamente."
    );
    loadOrders();
    loadTables();
  }

  async function closeTableCheckout(tableRow) {
    if (!tableRow?.id || closeTableSubmitting) return;
    if (closeTableTotalDiscount > 0 && !closeTableDiscountReason.trim()) {
      setMessage("Informe o motivo do desconto.");
      return;
    }
    setCloseTableSubmitting(true);
    const response = await fetch(`${API_URL}/tables/${tableRow.id}/close-checkout`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: closeTablePaymentMethod,
        discount: closeTableDiscountValue,
        discountPercent: closeTableDiscountPercentValue,
        discountReason: closeTableDiscountReason.trim() || null,
        surcharge: closeTableSurchargeValue,
      }),
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    setCloseTableSubmitting(false);
    if (!response.ok) {
      setMessage(
        data.message ||
          (response.status >= 500
            ? "Erro no servidor ao fechar comanda. Se usou desconto, tente de novo após atualizar a página."
            : `Não foi possível fechar (${response.status}). Verifique caixa aberto e comanda ativa.`)
      );
      return;
    }
    setMessage(
      `Mesa ${tableRow.number}: comanda fechada (${closeTablePaymentMethod}). QR bloqueado até o atendimento liberar novamente.`
    );
    setCloseTableModal(null);
    loadOrders();
    loadTables();
    loadTableDiscountClosures();
    loadCashCurrent();
    if (managesFinance) loadFinanceSummary();
  }

  function openCloseTableModal(tableRow) {
    if (!tableRow?.id) return;
    setCloseTableModal(tableRow);
    setCloseTablePaymentMethod("pix");
    setCloseTableDiscount("0");
    setCloseTableDiscountPercent("0");
    setCloseTableSurcharge("0");
    setCloseTableDiscountReason("");
    setCloseTableSubmitting(false);
  }

  function addProductToCart(productId, sizeLabel = null) {
    const parsedId = Number(productId);
    if (!parsedId) return;
    const product = products.find((p) => p.id === parsedId);
    if (!product) return;
    const labelNorm =
      sizeLabel != null && String(sizeLabel).trim()
        ? String(sizeLabel).trim()
        : null;
    if (productHasSizes(product) && !labelNorm) {
      setMessage(`Escolha o tamanho para "${product.name}" (botões P / M / G).`);
      return;
    }
    const line = {
      productId: parsedId,
      sizeLabel: productHasSizes(product) ? labelNorm : null,
      secondProductId: null,
      quantity: 1,
      note: "",
    };
    const key = cartLineKey(line);
    setCartItems((prev) => {
      const existing = prev.find((item) => cartLineKey(item) === key);
      if (existing) {
        return prev.map((item) =>
          cartLineKey(item) === key
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, line];
    });
  }

  function updateCartItem(lineKey, field, value) {
    setCartItems((prev) =>
      prev.map((item) => {
        if (cartLineKey(item) !== lineKey) return item;
        if (field === "quantity") {
          return { ...item, quantity: Math.max(1, Number(value) || 1) };
        }
        return { ...item, [field]: value };
      })
    );
  }

  function removeCartItem(lineKey) {
    setCartItems((prev) => prev.filter((item) => cartLineKey(item) !== lineKey));
  }

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return sum;
      const second = item.secondProductId
        ? products.find((p) => p.id === item.secondProductId)
        : null;
      const unit = unitPriceForCartLine(
        product,
        item.sizeLabel,
        item.secondProductId,
        second
      );
      return sum + unit * item.quantity;
    }, 0);
  }, [cartItems, products]);

  const deliveryFeeForOrder = useMemo(() => {
    if (orderType !== "entrega") return 0;
    return Number(Number(establishment?.deliveryFeeDefault || 0).toFixed(2));
  }, [orderType, establishment?.deliveryFeeDefault]);

  const orderGrandTotal = useMemo(
    () => Number((cartTotal + deliveryFeeForOrder).toFixed(2)),
    [cartTotal, deliveryFeeForOrder]
  );

  const filteredOrdersList = useMemo(() => {
    if (ordersTypeFilter === "entrega") {
      return orders.filter((o) => o.type === "entrega");
    }
    if (ordersTypeFilter === "retirada") {
      return orders.filter((o) => o.type === "retirada");
    }
    return orders;
  }, [orders, ordersTypeFilter]);

  async function setTableQrEnabled(tableId, qrEnabled) {
    if (!tableId) return;
    try {
      const response = await fetch(`${API_URL}/tables/${tableId}/qr-enabled`, {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ qrEnabled: Boolean(qrEnabled) }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setMessage(err.message || "Não foi possível atualizar o QR da mesa.");
      }
    } catch {
      setMessage("Falha de rede ao atualizar o QR da mesa.");
    } finally {
      loadTables();
    }
  }

  function selectTableForOrder(table) {
    setSelectedTableId(String(table.id));
    setOrderType("mesa");
    setActiveTab("novo");
    // Libera QR para o cliente enquanto o atendimento estiver com a mesa.
    void setTableQrEnabled(table.id, true);
    setMessage(`Comanda na mesa ${table.number}. Monte o pedido e finalize.`);
  }

  async function createOrderFromCart() {
    if (!cashCurrent) {
      const isOwner = normalizeRole(userRole) === "admin";
      setMessage(
        isOwner
          ? "Abra o turno de caixa (aba Financeiro) antes de registrar pedidos."
          : "Turno fechado. Peça ao administrador para abrir o turno no Financeiro."
      );
      if (isOwner) setActiveTab("caixa");
      return;
    }
    if (!cartItems.length || !selectedCustomerId) {
      setMessage("Adicione itens e selecione cliente.");
      return;
    }
    if (orderType === "mesa" && !selectedTableId) {
      setMessage("Selecione a mesa para comanda.");
      setActiveTab("mesas");
      return;
    }
    if (orderType === "entrega") {
      const digits = String(deliveryPhoneDraft || "").replace(/\D/g, "");
      if (digits.length < 10) {
        setMessage("Para entrega, informe telefone com DDD (mínimo 10 dígitos).");
        return;
      }
      if (String(deliveryAddressDraft || "").trim().length < 5) {
        setMessage("Para entrega, informe o endereço completo.");
        return;
      }
    }
    for (const item of cartItems) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      if (
        productHasSizes(product) &&
        isHalfHalfSizeLabel(item.sizeLabel) &&
        !item.secondProductId
      ) {
        setMessage(
          `Escolha o 2º sabor (meia a meia) para "${product.name}" no tamanho ${item.sizeLabel}.`
        );
        return;
      }
    }
    const response = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
        customerId: Number(selectedCustomerId),
        type: orderType,
        tableId: orderType === "mesa" ? Number(selectedTableId) : null,
        paymentMethod:
          normalizeRole(userRole) === "admin" && orderPaymentMethod
            ? orderPaymentMethod
            : null,
        note: orderNote,
        deliveryPhone: orderType === "entrega" ? deliveryPhoneDraft.trim() : undefined,
        deliveryAddress: orderType === "entrega" ? deliveryAddressDraft.trim() : undefined,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note,
          ...(item.sizeLabel ? { sizeLabel: item.sizeLabel } : {}),
          ...(item.secondProductId
            ? { secondProductId: Number(item.secondProductId) }
            : {}),
        })),
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao criar pedido.");
      return;
    }
    setCartItems([]);
    setOrderNote("");
    setOrderType("balcao");
    setOrderPaymentMethod("");
    setSelectedTableId("");
    setMessage("Pedido criado com sucesso.");
    loadOrders();
    loadTables();
    if (normalizeRole(userRole) === "admin") loadFinanceSummary();
  }

  async function updateOrderPayment(orderId, paymentMethod, paymentStatus) {
    if (paymentStatus === "pago" && !cashCurrent) {
      const isOwner = normalizeRole(userRole) === "admin";
      setMessage(
        isOwner
          ? "Abra o turno de caixa para registrar pagamento."
          : "Turno fechado. Quem registra pagamento é o administrador."
      );
      if (isOwner) setActiveTab("caixa");
      return;
    }
    const response = await fetch(`${API_URL}/orders/${orderId}/payment`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod, paymentStatus }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setMessage(err.message || "Falha ao atualizar pagamento.");
      return;
    }
    setMessage(`Pagamento do pedido #${orderId} atualizado.`);
    loadOrders();
    loadTables();
    if (normalizeRole(userRole) === "admin") loadFinanceSummary();
  }

  async function updateOrderStatus(orderId, status) {
    const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setMessage("Falha ao atualizar status do pedido.");
      return;
    }
    setMessage(`Pedido #${orderId} atualizado para ${status}.`);
    loadOrders();
    loadTables();
  }

  function getNextStatus(currentStatus) {
    const currentIndex = ORDER_STATUS.indexOf(currentStatus);
    if (currentIndex === -1 || currentIndex === ORDER_STATUS.length - 1) {
      return null;
    }
    return ORDER_STATUS[currentIndex + 1];
  }

  const kitchenOrders = useMemo(() => {
    if (kitchenFilter === "todos") return orders;
    return orders.filter((order) => order.status === kitchenFilter);
  }, [orders, kitchenFilter]);

  const productsByCategory = useMemo(
    () => groupProductsByCategory(products),
    [products]
  );

  const productsByCategoryForOrder = useMemo(
    () =>
      groupProductsByCategory(
        products.filter((p) => p.available !== false)
      ),
    [products]
  );

  const pendingPaymentOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus === "pendente"),
    [orders]
  );

  const pendingPaymentTotal = useMemo(
    () =>
      Number(
        pendingPaymentOrders.reduce((s, o) => s + Number(o.total || 0), 0).toFixed(
          2
        )
      ),
    [pendingPaymentOrders]
  );

  useEffect(() => {
    if (!token || activeTab !== "cozinha" || !kitchenAutoPrint) {
      kitchenAutoPrintBaselineRef.current = null;
      return;
    }
    if (kitchenAutoPrintBaselineRef.current === null) {
      if (orders.length === 0) return;
      kitchenAutoPrintBaselineRef.current = new Set(orders.map((o) => o.id));
      return;
    }
    const prev = kitchenAutoPrintBaselineRef.current;
    const nextSet = new Set(orders.map((o) => o.id));
    const newOrders = orders.filter((o) => !prev.has(o.id));
    kitchenAutoPrintBaselineRef.current = nextSet;

    const toPrint = newOrders.filter(
      (o) => o.status === "novo" && !kitchenAutoPrintWasSent(o.id)
    );
    toPrint.forEach((o, i) => {
      kitchenAutoPrintMarkSent(o.id);
      setTimeout(() => printKitchenTicket(o), i * 750);
    });
  }, [orders, activeTab, kitchenAutoPrint, token]);

  useEffect(() => {
    if (!token || !autoRefresh) return undefined;

    const intervalId = setInterval(() => {
      loadOrders(token);
      loadTables(token);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [token, autoRefresh]);

  useEffect(() => {
    if (!token) return;
    if (
      activeTab === "caixa" ||
      activeTab === "pedidos" ||
      activeTab === "cozinha"
    ) {
      loadOrders(token);
      loadTables(token);
      if (activeTab === "caixa" && normalizeRole(userRole) === "admin") {
        loadFinanceSummary(financeDate, token);
      }
    }
  }, [activeTab, token, userRole, financeDate]);

  useEffect(() => {
    if (!token || activeTab !== "dashboard") return;
    if (normalizeRole(userRole) !== "admin") return;
    loadAnalytics(analyticsDays, token);
  }, [token, activeTab, userRole, analyticsDays]);

  return (
    <div className="app-shell">
      {!token ? (
        <main className="login-screen">
          <div className="login-card card-elevated login-card-pro">
            <div className="brand-block login-brand">
              {hasEstablishmentLogo ? (
                <div className="brand-logo-wrap">
                  <img
                    className="brand-logo-img"
                    src={establishmentLogoSrc(establishment.logoUrl)}
                    alt=""
                    onError={() => setLogoLoadFailed(true)}
                  />
                </div>
              ) : (
                <span className="brand-mark" aria-hidden="true">
                  PZ
                </span>
              )}
              <div>
                <h1 className="brand-title">{displayTradeName}</h1>
                <p className="brand-tagline">Painel de gestão</p>
              </div>
            </div>
            <form className="grid" onSubmit={handleLogin}>
              <label className="field-label">
                E-mail
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field-label">
                Senha
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" className="btn-primary">
                Entrar
              </button>
            </form>
            <section className="login-recovery">
              <h3>Recuperar senha por código</h3>
              <form className="grid" onSubmit={requestRecoveryCode}>
                <label className="field-label">
                  E-mail do usuário
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn-secondary">
                  Solicitar código
                </button>
              </form>
              <form className="grid" onSubmit={confirmRecovery}>
                <input
                  placeholder="Código (6 dígitos)"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  maxLength={6}
                />
                <input
                  type="password"
                  placeholder="Nova senha"
                  value={recoveryNewPassword}
                  onChange={(e) => setRecoveryNewPassword(e.target.value)}
                  minLength={4}
                />
                <button type="submit" className="btn-ghost">
                  Redefinir senha
                </button>
              </form>
            </section>
          </div>
        </main>
      ) : (
        <>
          <aside className="sidebar">
            <div className="sidebar-brand">
              {hasEstablishmentLogo ? (
                <img
                  className="sidebar-logo-img"
                  src={establishmentLogoSrc(establishment.logoUrl)}
                  alt=""
                  onError={() => setLogoLoadFailed(true)}
                />
              ) : (
                <span className="brand-mark sm">PZ</span>
              )}
              <div className="sidebar-brand-text">
                <span className="sidebar-brand-title">{displayTradeName}</span>
                <span className="sidebar-brand-sub">Gestão</span>
              </div>
            </div>
            <nav className="sidebar-nav">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="sidebar-footer">
              <p className="user-line">
                {userName}
                {userRole ? (
                  <span className="user-role-tag">
                    {" "}
                    · {ROLE_LABELS[normalizeRole(userRole)] || userRole}
                  </span>
                ) : null}
              </p>
              <button type="button" className="btn-ghost" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </aside>

          <div className="main-area">
            <header className="topbar">
              <div>
                <h2 className="page-title">
                  {TABS.find((t) => t.id === activeTab)?.label}
                </h2>
                <p className="topbar-establishment">{displayTradeName}</p>
                <p className="page-sub">
                  {seesCashRegisterStatus ? (
                    <>
                      {cashCurrent ? (
                        <span className="badge badge-ok">Turno de caixa aberto</span>
                      ) : (
                        <span className="badge badge-warn">Turno de caixa fechado</span>
                      )}
                      {!cashCurrent && (
                        <span className="hint-inline">
                          {" "}
                          —
                          {managesFinance
                            ? " pedidos e recebimentos bloqueados até abrir o turno"
                            : " pedidos bloqueados até o administrador abrir o turno"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="hint-inline">
                      Turno de caixa visível para atendimento, garçom e
                      administrador.
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  loadOrders();
                  loadTables();
                  if (managesFinance) loadFinanceSummary();
                  if (managesFinance && activeTab === "dashboard") loadAnalytics();
                  if (seesCashRegisterStatus) loadCashCurrent();
                }}
              >
                Atualizar dados
              </button>
            </header>

            <main className="content">
              {activeTab === "inicio" && (
                <div className="grid-dashboard">
                  {managesFinance ? (
                    <div className="stat-card">
                      <h3>Financeiro</h3>
                      <p className="stat-value">
                        {cashCurrent ? "Turno aberto" : "Turno fechado"}
                      </p>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => setActiveTab("caixa")}
                      >
                        Abrir painel financeiro
                      </button>
                    </div>
                  ) : null}
                  {managesFinance ? (
                    <div className="stat-card">
                      <h3>Hoje</h3>
                      <p className="stat-value">
                        {financeSummary
                          ? `R$ ${financeSummary.paid.total.toFixed(2)}`
                          : "—"}
                      </p>
                      <p className="stat-muted">Recebido (pagos)</p>
                    </div>
                  ) : null}
                  {seesCashRegisterStatus && !managesFinance ? (
                    <div className="stat-card">
                      <h3>Turno de caixa</h3>
                      <p className="stat-value">
                        {cashCurrent ? "Aberto" : "Fechado"}
                      </p>
                      <p className="stat-muted">
                        {cashCurrent
                          ? "Você pode registrar pedidos."
                          : "Aguarde o administrador abrir o turno."}
                      </p>
                    </div>
                  ) : null}
                  {roleCanAccessTab(userRole, "mesas") ? (
                    <div className="stat-card">
                      <h3>Mesas</h3>
                      <p className="stat-value">
                        {occupiedTablesCount} / {tables.length}
                      </p>
                      <p className="stat-muted">Ocupadas</p>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => setActiveTab("mesas")}
                      >
                        Ver mesas
                      </button>
                    </div>
                  ) : null}
                  {!seesCashRegisterStatus &&
                  !roleCanAccessTab(userRole, "mesas") ? (
                    <div className="stat-card">
                      <h3>Pedidos</h3>
                      <p className="stat-muted">
                        Use a aba Cozinha ou Pedidos para acompanhar.
                      </p>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => setActiveTab("cozinha")}
                      >
                        Ir para cozinha
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {activeTab === "dashboard" &&
              roleCanAccessTab(userRole, "dashboard") ? (
                <AnalyticsDashboard
                  data={analyticsData}
                  loading={analyticsLoading}
                  days={analyticsDays}
                  onDaysChange={setAnalyticsDays}
                  onRefresh={() => loadAnalytics()}
                />
              ) : null}

              {activeTab === "mesas" && (
                <section className="card card-elevated">
                  <h2 className="section-title">Mapa de mesas</h2>
                  <p className="section-desc">
                    Toque na mesa para abrir comanda no balcão. O código na mesa
                    leva o cliente ao cardápio no celular — o pedido aparece na
                    Cozinha como os demais. Com comanda ativa,{" "}
                    <strong>administrador, atendimento ou garçom</strong> podem
                    fechar a comanda (com caixa aberto). Use{" "}
                    <strong>Imprimir QR</strong> ou <strong>PDF</strong> para
                    etiquetas na mesa.
                  </p>
                  {normalizeRole(userRole) === "admin" ? (
                    <form className="create-table-panel" onSubmit={createTable}>
                      <h3 className="create-table-title">Nova mesa</h3>
                      <p className="section-desc create-table-desc">
                        Número único por mesa. Rótulo opcional (ex.: Varanda). Só
                        administrador pode criar mesas.
                      </p>
                      <div className="row wrap create-table-row">
                        <label className="field-label">
                          Número da mesa
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            required
                            value={newTableNumber}
                            onChange={(e) => setNewTableNumber(e.target.value)}
                            placeholder="ex.: 12"
                          />
                        </label>
                        <label className="field-label">
                          Rótulo (opcional)
                          <input
                            type="text"
                            value={newTableLabel}
                            onChange={(e) => setNewTableLabel(e.target.value)}
                            placeholder="ex.: Varanda"
                          />
                        </label>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={createTableBusy}
                        >
                          {createTableBusy ? "Criando…" : "Criar mesa"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {typeof window !== "undefined" &&
                  getEnvPublicOrigin() &&
                  getEnvPublicOrigin() !== window.location.origin ? (
                    <div className="qr-origin-banner">
                      <strong>Endereço do cardápio na mesa</strong>
                      <p>
                        O sistema está configurado para abrir o cardápio em{" "}
                        <strong>{getEnvPublicOrigin()}</strong>, mas você acessou
                        o painel em <strong>{window.location.origin}</strong>.
                        Use o mesmo endereço que os clientes usam ou peça ao
                        suporte da instalação para alinhar os links.
                      </p>
                    </div>
                  ) : null}
                  {showQrLocalhostHelp ? (
                    <div className="qr-origin-banner">
                      <strong>Configurar link na rede Wi‑Fi</strong>
                      <p>
                        Se você abre o painel só neste computador, o celular não
                        encontra o cardápio. Informe abaixo o endereço que o
                        celular deve usar na mesma rede (em geral o IP deste PC
                        com a porta do sistema), por exemplo{" "}
                        <code>http://192.168.0.15:5173</code>.
                      </p>
                      <div className="row wrap qr-origin-row">
                        <input
                          className="qr-origin-input"
                          type="url"
                          placeholder="http://192.168.x.x:5173"
                          value={qrLinkDraft}
                          onChange={(e) => setQrLinkDraft(e.target.value)}
                        />
                        <button type="button" onClick={saveQrLinkBase}>
                          Salvar link do cardápio
                        </button>
                      </div>
                      {!getEnvPublicOrigin() ? (
                        <p className="qr-origin-env-hint">
                          Quem instalou o sistema pode fixar esse endereço para
                          você não precisar repetir este passo.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {!qrLinkConfigured && !showQrLocalhostHelp ? (
                    <p className="qr-origin-warn">
                      Informe e salve o endereço público do sistema acima para
                      gerar os códigos das mesas.
                    </p>
                  ) : null}
                  {!showQrLocalhostHelp && import.meta.env.PROD ? (
                    <div className="qr-origin-banner qr-cloud-banner">
                      <strong>Uso na internet</strong>
                      <p>
                        Na publicação em site próprio, o código leva o cliente ao
                        cardápio pelo mesmo endereço do painel, com conexão segura
                        (HTTPS). Se o código não abrir no celular, peça ajuda a
                        quem instalou o sistema.
                      </p>
                    </div>
                  ) : null}
                  <div className="tables-grid">
                    {tables.map((t) => {
                      const busy = t.openOrders?.length > 0;
                      const pendingRequests = Array.isArray(t.serviceRequests)
                        ? t.serviceRequests
                        : [];
                      const clientPath = mesaPublicUrl(
                        t.publicToken,
                        qrLinkBase
                      );
                      return (
                        <div
                          key={t.id}
                          className={`table-tile-card ${busy ? "busy" : "free"}`}
                        >
                          <button
                            type="button"
                            className="table-tile-main"
                            onClick={() => selectTableForOrder(t)}
                          >
                            <span className="table-num">Mesa {t.number}</span>
                            {t.label ? (
                              <span className="table-label">{t.label}</span>
                            ) : null}
                            <span className="table-status">
                              {busy
                                ? `${t.openOrders.length} comanda(s) ativa(s)`
                                : "Livre"}
                            </span>
                            {busy ? (
                              <ul className="table-orders-mini">
                                {t.openOrders.slice(0, 3).map((o) => (
                                  <li key={o.id}>
                                    #{o.id} — {o.customer?.name} — R${" "}
                                    {o.total.toFixed(2)} ({o.status})
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {pendingRequests.length ? (
                              <ul className="table-orders-mini">
                                {pendingRequests.slice(0, 3).map((s) => (
                                  <li key={s.id}>
                                    {s.requestType === "fechar_conta"
                                      ? `Fechar conta (${s.paymentMethod || "sem forma"})`
                                      : "Chamar garçom"}
                                    {s.customerName ? ` — ${s.customerName}` : ""}
                                    <span
                                      className="btn-link"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        attendServiceRequest(s.id);
                                      }}
                                    >
                                      Atender
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </button>
                          {t.publicToken ? (
                            t.qrEnabled ? (
                              <div className="table-tile-qr">
                                {clientPath ? (
                                  <>
                                    <QRCodeSVG
                                      value={clientPath}
                                      size={88}
                                      level="M"
                                    />
                                    <div className="table-tile-qr-text">
                                      <p className="table-qr-hint">
                                        Cliente escaneia e pede
                                      </p>
                                      <div className="table-tile-qr-actions">
                                        <button
                                          type="button"
                                          className="btn-sm"
                                          onClick={() => {
                                            navigator.clipboard.writeText(
                                              clientPath
                                            );
                                            setMessage("Link da mesa copiado.");
                                          }}
                                        >
                                          Copiar link
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-sm"
                                          onClick={() => {
                                            void handlePrintTableQr(t, clientPath);
                                          }}
                                        >
                                          Imprimir QR
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-sm"
                                          onClick={() => {
                                            void handleDownloadTableQrPdf(t, clientPath);
                                          }}
                                        >
                                          Salvar PDF
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <p className="table-qr-missing">
                                    Configure o link do cardápio acima para gerar o
                                    código desta mesa.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="table-tile-qr">
                                <p className="table-qr-missing">
                                  QR bloqueado até o atendimento liberar a mesa.
                                </p>
                                {clientPath ? (
                                  <div className="table-tile-qr-actions">
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() => {
                                        navigator.clipboard.writeText(clientPath);
                                        setMessage("Link da mesa copiado.");
                                      }}
                                    >
                                      Copiar link
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() => {
                                        void handlePrintTableQr(t, clientPath);
                                      }}
                                    >
                                      Imprimir QR
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() => {
                                        void handleDownloadTableQrPdf(t, clientPath);
                                      }}
                                    >
                                      Salvar PDF
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            )
                          ) : null}
                          {canCloseTableCheckout && busy ? (
                            <div className="table-tile-actions">
                              <button
                                type="button"
                                className="btn-sm btn-sm-danger"
                                onClick={() => openCloseTableModal(t)}
                              >
                                Fechar comanda
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {activeTab === "novo" && (
                <section className="card card-elevated">
                  <h2 className="section-title">Novo pedido</h2>
                  <div className="row wrap">
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                    >
                      <option value="">Cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                                       <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value)}
                    >
                      <option value="balcao">Balcão</option>
                      <option value="mesa">Mesa (comanda)</option>
                      <option value="retirada">Retirada no balcão</option>
                      <option value="entrega">Entrega (delivery)</option>
                    </select>
                    {orderType === "entrega" ? (
                      <div className="delivery-fields grid">
                        <label className="field-label">
                          Telefone (contato na entrega)
                          <input
                            value={deliveryPhoneDraft}
                            onChange={(e) => setDeliveryPhoneDraft(e.target.value)}
                            placeholder="DDD + WhatsApp"
                            autoComplete="tel"
                          />
                        </label>
                        <label className="field-label">
                          Endereço de entrega
                          <textarea
                            rows={2}
                            value={deliveryAddressDraft}
                            onChange={(e) => setDeliveryAddressDraft(e.target.value)}
                            placeholder="Rua, número, bairro, referência"
                          />
                        </label>
                        <p className="hint-inline delivery-fee-hint">
                          Taxa de entrega: R$ {deliveryFeeForOrder.toFixed(2)} (definida
                          em Cadastros pelo administrador)
                        </p>
                      </div>
                    ) : null}
                    {orderType === "mesa" ? (
                      <select
                        value={selectedTableId}
                        onChange={(e) => setSelectedTableId(e.target.value)}
                      >
                        <option value="">Escolher mesa</option>
                        {tables.map((t) => (
                          <option key={t.id} value={t.id}>
                            Mesa {t.number}
                            {t.label ? ` (${t.label})` : ""}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {managesFinance ? (
                      <select
                        value={orderPaymentMethod}
                        onChange={(e) => setOrderPaymentMethod(e.target.value)}
                      >
                        <option value="">Pagamento pendente</option>
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="hint-inline novo-pay-hint">
                        Pagamento: só o administrador marca na criação ou na aba
                        Pedidos.
                      </span>
                    )}
                  </div>

                  <textarea
                    className="textarea"
                    placeholder="Observação geral do pedido"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                  />

                  <p className="product-chips-label">Itens (só disponíveis)</p>
                  {productsByCategoryForOrder.length === 0 ? (
                    <p className="empty-hint">
                      Nenhum item disponível. Ative itens na aba Cardápio ou
                      cadastre novos.
                    </p>
                  ) : (
                    <div className="product-chips-grouped">
                      {productsByCategoryForOrder.map(({ category, items }) => (
                        <div key={category} className="chip-category-block">
                          <span className="chip-category-title">{category}</span>
                          <div className="product-chips">
                            {items.map((product) =>
                              productHasSizes(product) ? (
                                <div key={product.id} className="chip-size-group">
                                  <span className="chip-size-group-name">
                                    {product.imageUrl ? (
                                      <img
                                        className="chip-thumb chip-thumb-inline"
                                        src={productImageSrc(product.imageUrl)}
                                        alt=""
                                      />
                                    ) : null}
                                    {product.name}
                                  </span>
                                  <div className="chip-size-buttons">
                                    {product.sizes.map((sz) => (
                                      <button
                                        key={`${product.id}-${sz.label}`}
                                        type="button"
                                        className="chip chip-size-chip"
                                        onClick={() =>
                                          addProductToCart(product.id, sz.label)
                                        }
                                      >
                                        {String(sz.label).trim()} R${" "}
                                        {Number(sz.price).toFixed(2)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <button
                                  key={product.id}
                                  type="button"
                                  className="chip chip-with-photo"
                                  onClick={() => addProductToCart(product.id)}
                                >
                                  {product.imageUrl ? (
                                    <img
                                      className="chip-thumb"
                                      src={productImageSrc(product.imageUrl)}
                                      alt=""
                                    />
                                  ) : null}
                                  <span className="chip-label">
                                    + {product.name}
                                  </span>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cartItems.length === 0 ? (
                    <p className="empty-hint">Nenhum item no pedido.</p>
                  ) : (
                    <div className="grid cart-grid">
                      {cartItems.map((item) => {
                        const product = products.find((p) => p.id === item.productId);
                        if (!product) return null;
                        const lk = cartLineKey(item);
                        const secondProd = item.secondProductId
                          ? products.find((p) => p.id === item.secondProductId)
                          : null;
                        const unit = unitPriceForCartLine(
                          product,
                          item.sizeLabel,
                          item.secondProductId,
                          secondProd
                        );
                        const needSecond =
                          productHasSizes(product) &&
                          isHalfHalfSizeLabel(item.sizeLabel);
                        const secondOptions = needSecond
                          ? products.filter(
                              (p) =>
                                p.id !== product.id &&
                                p.available !== false &&
                                productHasSizes(p) &&
                                p.sizes.some(
                                  (s) =>
                                    String(s.label).trim().toLowerCase() ===
                                    String(item.sizeLabel).trim().toLowerCase()
                                )
                            )
                          : [];
                        return (
                          <div className="order-item-card" key={lk}>
                            <strong>
                              {product.name}
                              {item.secondProductId && secondProd ? (
                                <>
                                  {" + "}
                                  {secondProd.name}
                                </>
                              ) : null}
                              {item.sizeLabel ? (
                                <span className="order-item-size">
                                  {" "}
                                  — {item.sizeLabel}
                                </span>
                              ) : null}
                            </strong>
                            {needSecond ? (
                              <label className="cart-second-flavor">
                                <span>2º sabor (meia a meia)</span>
                                <select
                                  value={item.secondProductId ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updateCartItem(
                                      lk,
                                      "secondProductId",
                                      v ? Number(v) : null
                                    );
                                  }}
                                >
                                  <option value="">Escolher…</option>
                                  {secondOptions.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                            <div className="row">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateCartItem(lk, "quantity", e.target.value)
                                }
                              />
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => removeCartItem(lk)}
                              >
                                Remover
                              </button>
                            </div>
                            <input
                              placeholder="Obs. do item"
                              value={item.note}
                              onChange={(e) =>
                                updateCartItem(lk, "note", e.target.value)
                              }
                            />
                            <p className="subtotal-line">
                              Subtotal: R$ {(unit * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="order-total">
                    <p>Itens: R$ {cartTotal.toFixed(2)}</p>
                    {orderType === "entrega" && deliveryFeeForOrder > 0 ? (
                      <p className="order-total-fee">
                        Taxa de entrega: R$ {deliveryFeeForOrder.toFixed(2)}
                      </p>
                    ) : null}
                    <p>
                      <strong>Total: R$ {orderGrandTotal.toFixed(2)}</strong>
                    </p>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={createOrderFromCart}
                    >
                      Enviar pedido
                    </button>
                  </div>
                </section>
              )}

              {activeTab === "cardapio" && (
                <section className="card card-elevated cardapio-section">
                  <h2 className="section-title">Cardápio</h2>
                  <p className="section-desc">
                    Monte o cardápio completo: pizzas, pastéis, bebidas, lanches,
                    etc. Para pizzas, cadastre tamanhos (P/M/G) com preço cada.
                    Desmarque &quot;Disponível&quot; para esconder o item do
                    cardápio no celular
                    e do novo pedido (ex.: acabou). Relatórios em CSV na aba
                    Relatórios.
                  </p>

                  {menuEdit ? (
                    <form className="menu-edit-form card-inner" onSubmit={saveMenuEdit}>
                      <h3 className="subsection-title">Editar item</h3>
                      <div className="menu-form-grid">
                        <div className="menu-photo-column">
                          {menuEdit.imageUrl ? (
                            <div className="menu-photo-preview">
                              <img
                                src={productImageSrc(menuEdit.imageUrl)}
                                alt=""
                              />
                            </div>
                          ) : (
                            <div className="menu-photo-placeholder">
                              Sem foto
                            </div>
                          )}
                          <label className="menu-photo-file">
                            <span>Trocar foto</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (!f) return;
                                try {
                                  setMessage("Enviando foto...");
                                  const { imageUrl } = await uploadProductPhoto(f);
                                  setMenuEdit((m) => ({ ...m, imageUrl }));
                                  setMessage("Foto atualizada. Salve o item.");
                                } catch (err) {
                                  setMessage(err.message || "Falha no envio.");
                                }
                              }}
                            />
                          </label>
                          {menuEdit.imageUrl ? (
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() =>
                                setMenuEdit((m) => ({ ...m, imageUrl: null }))
                              }
                            >
                              Remover foto
                            </button>
                          ) : null}
                        </div>
                        <div className="menu-fields-column">
                          <div className="row wrap">
                            <input
                              required
                              placeholder="Nome"
                              value={menuEdit.name}
                              onChange={(e) =>
                                setMenuEdit((m) => ({
                                  ...m,
                                  name: e.target.value,
                                }))
                              }
                            />
                            <input
                              required
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Preço"
                              value={menuEdit.price}
                              onChange={(e) =>
                                setMenuEdit((m) => ({
                                  ...m,
                                  price: e.target.value,
                                }))
                              }
                            />
                            <input
                              required
                              list="menu-cat-datalist"
                              placeholder="Ex: pastel, bebidas, pizza"
                              value={menuEdit.category}
                              onChange={(e) =>
                                setMenuEdit((m) => ({
                                  ...m,
                                  category: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="menu-sizes-editor">
                            <p className="menu-sizes-hint">
                              Tamanhos (opcional): ex. P, M, G — cada um com preço.
                              Deixe vazio se o item não tiver tamanho.
                            </p>
                            {(menuEdit.sizes || []).map((row, idx) => (
                              <div key={idx} className="row wrap menu-size-row">
                                <input
                                  placeholder="Ex: P"
                                  value={row.label}
                                  onChange={(e) => {
                                    const next = [...(menuEdit.sizes || [])];
                                    next[idx] = { ...next[idx], label: e.target.value };
                                    setMenuEdit((m) => ({ ...m, sizes: next }));
                                  }}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Preço"
                                  value={row.price}
                                  onChange={(e) => {
                                    const next = [...(menuEdit.sizes || [])];
                                    next[idx] = { ...next[idx], price: e.target.value };
                                    setMenuEdit((m) => ({ ...m, sizes: next }));
                                  }}
                                />
                                <button
                                  type="button"
                                  className="btn-outline btn-sm"
                                  onClick={() => {
                                    const next = (menuEdit.sizes || []).filter(
                                      (_, i) => i !== idx
                                    );
                                    setMenuEdit((m) => ({ ...m, sizes: next }));
                                  }}
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() =>
                                setMenuEdit((m) => ({
                                  ...m,
                                  sizes: [...(m.sizes || []), { label: "", price: "" }],
                                }))
                              }
                            >
                              + Tamanho
                            </button>
                          </div>
                          <label className="menu-available-check">
                            <input
                              type="checkbox"
                              checked={menuEdit.available !== false}
                              onChange={(e) =>
                                setMenuEdit((m) => ({
                                  ...m,
                                  available: e.target.checked,
                                }))
                              }
                            />
                            <span>Disponível no cardápio do celular e no novo pedido</span>
                          </label>
                          <div className="row">
                            <button type="submit" className="btn-primary">
                              Salvar
                            </button>
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => setMenuEdit(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    </form>
                  ) : null}

                  <form className="menu-new-form card-inner" onSubmit={createProduct}>
                    <h3 className="subsection-title">Novo item</h3>
                    <div className="menu-form-grid">
                      <div className="menu-photo-column">
                        {newProductImageUrl ? (
                          <div className="menu-photo-preview">
                            <img
                              src={productImageSrc(newProductImageUrl)}
                              alt=""
                            />
                          </div>
                        ) : (
                          <div className="menu-photo-placeholder">
                            Sem foto
                          </div>
                        )}
                        <label className="menu-photo-file">
                          <span>Escolher foto</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              try {
                                setMessage("Enviando foto...");
                                const { imageUrl } = await uploadProductPhoto(f);
                                setNewProductImageUrl(imageUrl);
                                setMessage("Foto anexada. Preencha e salve o item.");
                              } catch (err) {
                                setMessage(err.message || "Falha no envio.");
                              }
                            }}
                          />
                        </label>
                        {newProductImageUrl ? (
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => setNewProductImageUrl(null)}
                          >
                            Remover foto
                          </button>
                        ) : null}
                      </div>
                      <div className="menu-fields-column">
                        <div className="row wrap">
                          <input
                            placeholder="Nome"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            required
                          />
                          <input
                            placeholder="Preço"
                            type="number"
                            min="0"
                            step="0.01"
                            value={newProductPrice}
                            onChange={(e) => setNewProductPrice(e.target.value)}
                            required
                          />
                          <input
                            list="menu-cat-datalist"
                            placeholder="Ex: pastel, bebidas, pizza (ou vazio = outros)"
                            value={newProductCategory}
                            onChange={(e) =>
                              setNewProductCategory(e.target.value)
                            }
                          />
                        </div>
                        <div className="menu-sizes-editor">
                          <p className="menu-sizes-hint">
                            Tamanhos (opcional): ex. P, M, G — cada um com preço.
                            O campo &quot;Preço&quot; acima vira o menor valor (referência).
                          </p>
                          {newProductSizes.map((row, idx) => (
                            <div key={idx} className="row wrap menu-size-row">
                              <input
                                placeholder="Ex: P"
                                value={row.label}
                                onChange={(e) => {
                                  const next = [...newProductSizes];
                                  next[idx] = { ...next[idx], label: e.target.value };
                                  setNewProductSizes(next);
                                }}
                              />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Preço"
                                value={row.price}
                                onChange={(e) => {
                                  const next = [...newProductSizes];
                                  next[idx] = { ...next[idx], price: e.target.value };
                                  setNewProductSizes(next);
                                }}
                              />
                              <button
                                type="button"
                                className="btn-outline btn-sm"
                                onClick={() =>
                                  setNewProductSizes((rows) =>
                                    rows.filter((_, i) => i !== idx)
                                  )
                                }
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() =>
                              setNewProductSizes((rows) => [
                                ...rows,
                                { label: "", price: "" },
                              ])
                            }
                          >
                            + Tamanho
                          </button>
                        </div>
                        <label className="menu-available-check">
                          <input
                            type="checkbox"
                            checked={newProductAvailable}
                            onChange={(e) =>
                              setNewProductAvailable(e.target.checked)
                            }
                          />
                          <span>Disponível no cardápio do celular e no novo pedido</span>
                        </label>
                        <datalist id="menu-cat-datalist">
                          {MENU_CATEGORY_PRESETS.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                        <button type="submit" className="btn-primary">
                          Adicionar ao cardápio
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="menu-by-category">
                    {productsByCategory.length === 0 ? (
                      <p className="empty-hint">Nenhum produto cadastrado.</p>
                    ) : (
                      productsByCategory.map(({ category, items }) => (
                        <div key={category} className="menu-category-block">
                          <h3 className="menu-category-heading">{category}</h3>
                          <ul className="menu-item-list menu-item-cards">
                            {items.map((p) => (
                              <li
                                key={p.id}
                                className={`menu-item-card ${
                                  p.available === false
                                    ? "menu-item-card-off"
                                    : ""
                                }`}
                              >
                                <div className="menu-item-card-thumb">
                                  {p.imageUrl ? (
                                    <img
                                      src={productImageSrc(p.imageUrl)}
                                      alt=""
                                    />
                                  ) : (
                                    <span className="menu-item-no-photo">
                                      Sem foto
                                    </span>
                                  )}
                                </div>
                                <div className="menu-item-card-body">
                                  <strong>{p.name}</strong>
                                  {p.available === false ? (
                                    <span className="menu-availability-badge off">
                                      Indisponível
                                    </span>
                                  ) : (
                                    <span className="menu-availability-badge on">
                                      Disponível
                                    </span>
                                  )}
                                  <span className="menu-item-price menu-item-price-sizes">
                                    {productSizesPriceSummary(p)}
                                  </span>
                                  <div className="row wrap menu-item-actions">
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() => toggleProductAvailable(p)}
                                    >
                                      {p.available === false
                                        ? "Disponibilizar"
                                        : "Indisponibilizar"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() =>
                                        setMenuEdit({
                                          id: p.id,
                                          name: p.name,
                                          price: String(p.price),
                                          category:
                                            p.category || DEFAULT_MENU_CATEGORY,
                                          imageUrl: p.imageUrl || null,
                                          available: p.available !== false,
                                          sizes: (p.sizes || []).map((s) => ({
                                            label: s.label,
                                            price: String(s.price),
                                          })),
                                        })
                                      }
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-sm"
                                      onClick={() => deleteMenuProduct(p.id)}
                                    >
                                      Excluir
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              {activeTab === "cozinha" && (
                <section className="card kitchen-card card-elevated">
                  <h2 className="section-title">Cozinha</h2>
                  <div className="row wrap">
                    <button type="button" onClick={() => loadOrders()}>
                      Atualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoRefresh((v) => !v)}
                    >
                      Auto: {autoRefresh ? "on" : "off"}
                    </button>
                    <select
                      value={kitchenFilter}
                      onChange={(e) => setKitchenFilter(e.target.value)}
                    >
                      <option value="todos">Todos</option>
                      {ORDER_STATUS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <label className="field-label inline kitchen-thermal-field">
                      <span>Papel térmico</span>
                      <select
                        value={kitchenThermalPaperMm}
                        onChange={(e) => {
                          const v = e.target.value;
                          setKitchenThermalPaperMm(v);
                          try {
                            localStorage.setItem(THERMAL_PAPER_LS_KEY, v);
                          } catch {
                            /* ignore */
                          }
                        }}
                        aria-label="Largura do papel da impressora térmica"
                      >
                        <option value="80">80 mm</option>
                        <option value="58">58 mm</option>
                      </select>
                    </label>
                    <label className="field-label inline kitchen-auto-print-field">
                      <input
                        type="checkbox"
                        checked={kitchenAutoPrint}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setKitchenAutoPrint(on);
                          try {
                            localStorage.setItem(
                              KITCHEN_AUTO_PRINT_ENABLED_KEY,
                              on ? "1" : "0"
                            );
                          } catch {
                            /* ignore */
                          }
                        }}
                      />
                      <span>Impressão automática (pedidos novos)</span>
                    </label>
                    <span className="kitchen-sync">
                      Atualizado: {lastKitchenSync || "—"}
                    </span>
                  </div>
                  <p className="section-desc kitchen-print-hint">
                    <strong>Impressora térmica:</strong> com o driver instalado e
                    papel {kitchenThermalPaperMm} mm, use <strong>Imprimir</strong>{" "}
                    para o comprovante na própria tela. Com{" "}
                    <strong>Impressão automática</strong>, pedidos novos podem
                    sair sozinhos enquanto esta aba estiver aberta (uma vez por
                    pedido neste navegador).
                  </p>
                  {kitchenAutoPrint ? (
                    <p className="section-desc kitchen-kiosk-hint">
                      <strong>Imprimir direto:</strong> para não aparecer a caixa
                      “Imprimir” toda vez, peça ao suporte técnico para configurar
                      o Chrome ou o Edge em modo quiosque com impressão silenciosa
                      e defina a térmica como impressora padrão no Windows.
                    </p>
                  ) : null}

                  {kitchenOrders.length === 0 ? (
                    <p>Nenhum pedido no filtro.</p>
                  ) : (
                    <div className="kitchen-grid">
                      {kitchenOrders.map((order) => {
                        const nextStatus = getNextStatus(order.status);
                        return (
                          <article key={order.id} className="kitchen-ticket">
                            <h3>#{order.id}</h3>
                            <p>{order.customer?.name}</p>
                            <p>
                              {order.type}
                              {order.table
                                ? ` — Mesa ${order.table.number}`
                                : ""}
                              {order.orderSource === "qr_mesa" ? (
                                <span className="source-badge">Pedido celular</span>
                              ) : null}
                            </p>
                            {order.type === "entrega" && order.deliveryAddress ? (
                              <p className="kitchen-delivery-line">
                                {order.deliveryAddress}
                                {order.customer?.phone
                                  ? ` · ${order.customer.phone}`
                                  : ""}
                              </p>
                            ) : null}
                            <p>Status: {order.status}</p>
                            <p>R$ {order.total.toFixed(2)}</p>
                            <div className="kitchen-ticket-actions">
                              <button
                                type="button"
                                className="btn-outline btn-sm"
                                onClick={() => printKitchenTicket(order)}
                              >
                                Imprimir
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={!nextStatus}
                                onClick={() =>
                                  nextStatus &&
                                  updateOrderStatus(order.id, nextStatus)
                                }
                              >
                                {nextStatus
                                  ? `Avançar (${nextStatus})`
                                  : "Finalizado"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {activeTab === "caixa" && (
                <>
                  <section className="card card-elevated caixa-pendente-card">
                    <h2 className="section-title">Contas em aberto</h2>
                    <p className="section-desc">
                      Pedidos com pagamento pendente. Registre dinheiro, Pix ou
                      cartao aqui (o turno de caixa precisa estar aberto).
                    </p>
                    <p className="caixa-pendente-total">
                      Total a receber:{" "}
                      <strong>R$ {pendingPaymentTotal.toFixed(2)}</strong> —{" "}
                      {pendingPaymentOrders.length} pedido(s)
                    </p>
                    {!cashCurrent ? (
                      <p className="caixa-pendente-warn">
                        Abra o turno de caixa abaixo para registrar pagamentos.
                      </p>
                    ) : null}
                    {pendingPaymentOrders.length === 0 ? (
                      <p className="empty-hint">Nenhuma conta pendente.</p>
                    ) : (
                      <ul className="caixa-pendente-list">
                        {pendingPaymentOrders.slice(0, 25).map((o) => (
                          <li key={o.id} className="caixa-pendente-row">
                            <div>
                              <strong>#{o.id}</strong> {o.customer?.name}
                              <span className="caixa-pendente-meta">
                                {o.type}
                                {o.table ? ` — Mesa ${o.table.number}` : ""} | R${" "}
                                {Number(o.total).toFixed(2)}
                              </span>
                            </div>
                            <div className="row wrap">
                              {PAYMENT_METHODS.map((method) => (
                                <button
                                  key={method}
                                  type="button"
                                  className="btn-sm"
                                  onClick={() =>
                                    updateOrderPayment(o.id, method, "pago")
                                  }
                                >
                                  {method}
                                </button>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pendingPaymentOrders.length > 25 ? (
                      <p className="section-desc">
                        Mostrando 25 de {pendingPaymentOrders.length}. Veja todos
                        na aba Pedidos.
                      </p>
                    ) : null}
                  </section>

                  <section className="card card-elevated">
                    <h2 className="section-title">Resumo do dia</h2>
                    <div className="row wrap">
                      <input
                        type="date"
                        value={financeDate}
                        onChange={(e) => setFinanceDate(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          setFinanceDate(today);
                          loadFinanceSummary(today);
                        }}
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => loadFinanceSummary(financeDate)}
                      >
                        Atualizar
                      </button>
                    </div>
                    {financeSummary ? (
                      <div className="finance-grid">
                        <p>Pedidos: {financeSummary.totalOrders}</p>
                        <p>Bruto: R$ {financeSummary.totalRevenue.toFixed(2)}</p>
                        <p>Recebido: R$ {financeSummary.paid.total.toFixed(2)}</p>
                        <p>Dinheiro: R$ {financeSummary.paid.dinheiro.toFixed(2)}</p>
                        <p>Pix: R$ {financeSummary.paid.pix.toFixed(2)}</p>
                        <p>Cartao: R$ {financeSummary.paid.cartao.toFixed(2)}</p>
                        <p>Pendente: R$ {financeSummary.pending.toFixed(2)}</p>
                      </div>
                    ) : null}
                  </section>

                  <section className="card cash-card card-elevated">
                    <h2 className="section-title">Abertura e fechamento</h2>
                    {cashCurrent ? (
                      <>
                        <p>
                          Aberto desde{" "}
                          {new Date(cashCurrent.openedAt).toLocaleString("pt-BR")}
                        </p>
                        <p>
                          Troco inicial: R${" "}
                          {Number(cashCurrent.openingBalance).toFixed(2)}
                        </p>
                        <div className="grid">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Dinheiro contado (opcional)"
                            value={cashCloseBalance}
                            onChange={(e) => setCashCloseBalance(e.target.value)}
                          />
                          <input
                            placeholder="Obs. fechamento"
                            value={cashCloseNote}
                            onChange={(e) => setCashCloseNote(e.target.value)}
                          />
                          <button type="button" className="btn-primary" onClick={closeCash}>
                            Fechar caixa
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="grid">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Troco inicial"
                          value={cashOpenBalance}
                          onChange={(e) => setCashOpenBalance(e.target.value)}
                        />
                        <input
                          placeholder="Obs. abertura"
                          value={cashOpenNote}
                          onChange={(e) => setCashOpenNote(e.target.value)}
                        />
                        <button type="button" className="btn-primary" onClick={openCash}>
                          Abrir caixa
                        </button>
                      </div>
                    )}
                    <h3 className="cash-history-title">Ultimos fechamentos</h3>
                    <ul className="cash-history">
                      {cashShifts.map((s) => (
                        <li key={s.id}>
                          #{s.id} —{" "}
                          {s.closedAt
                            ? new Date(s.closedAt).toLocaleString("pt-BR")
                            : "-"}
                          {s.summary ? (
                            <>
                              {" "}
                              | R$ {Number(s.summary.paid?.total || 0).toFixed(2)}
                              {s.summary.cashDifference != null
                                ? ` | Diff gaveta R$ ${Number(s.summary.cashDifference).toFixed(2)}`
                                : ""}
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="card card-elevated">
                    <h3 className="cash-history-title">Fechamentos com desconto</h3>
                    {tableDiscountClosures.length === 0 ? (
                      <p className="empty-hint">Nenhum fechamento com desconto registrado.</p>
                    ) : (
                      <ul className="cash-history">
                        {tableDiscountClosures.map((row) => (
                          <li key={row.id}>
                            Mesa {row.table?.number}
                            {row.table?.label ? ` (${row.table.label})` : ""} | R${" "}
                            {Number(row.netTotal).toFixed(2)} (bruto R${" "}
                            {Number(row.grossTotal).toFixed(2)}, desc. R${" "}
                            {Number(row.totalDiscount).toFixed(2)}, acresc. R${" "}
                            {Number(row.surcharge).toFixed(2)}) |{" "}
                            {new Date(row.createdAt).toLocaleString("pt-BR")} | por{" "}
                            {row.user?.name || row.user?.email || "usuário"}
                            <br />
                            Motivo: {row.discountReason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}

              {activeTab === "pedidos" && (
                <section className="card card-elevated">
                  <h2 className="section-title">Todos os pedidos</h2>
                  <div className="row wrap orders-filter-row">
                    <label className="field-label inline">
                      Filtrar
                      <select
                        value={ordersTypeFilter}
                        onChange={(e) => setOrdersTypeFilter(e.target.value)}
                      >
                        <option value="todos">Todos</option>
                        <option value="entrega">Só entrega (delivery)</option>
                        <option value="retirada">Só retirada</option>
                      </select>
                    </label>
                  </div>
                  <ul className="orders-list">
                    {filteredOrdersList.map((o) => (
                      <li key={o.id} className="order-row">
                        <div className="order-row-head">
                          <strong>#{o.id}</strong> {o.customer?.name} — R${" "}
                          {o.total.toFixed(2)} — {o.status}
                          {o.table ? (
                            <span className="mesa-tag">
                              Mesa {o.table.number}
                            </span>
                          ) : null}
                          {o.orderSource === "qr_mesa" ? (
                            <span className="source-badge">Pedido celular</span>
                          ) : null}
                          {o.type === "entrega" ? (
                            <span className="source-badge badge-delivery">Entrega</span>
                          ) : null}
                        </div>
                        <p className="order-meta">
                          {o.type} | Pag: {o.paymentStatus}{" "}
                          {o.paymentMethod ? `(${o.paymentMethod})` : ""}
                          {o.type === "entrega" && Number(o.deliveryFee || 0) > 0
                            ? ` | Taxa de entrega R$ ${Number(o.deliveryFee).toFixed(2)}`
                            : ""}
                        </p>
                        {o.type === "entrega" && o.deliveryAddress ? (
                          <p className="order-delivery-addr">
                            <strong>Endereço:</strong> {o.deliveryAddress}
                            {o.customer?.phone ? ` · ${o.customer.phone}` : ""}
                          </p>
                        ) : null}
                        {o.note ? <p>Obs: {o.note}</p> : null}
                        {o.items?.length ? (
                          <ul>
                            {o.items.map((item) => (
                              <li key={item.id}>
                                {item.quantity}x {item.product?.name}
                                {item.secondProduct?.name
                                  ? ` + ${item.secondProduct.name}`
                                  : ""}
                                {item.sizeLabel
                                  ? ` (${String(item.sizeLabel).trim()})`
                                  : ""}
                                {item.note ? ` — ${item.note}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {canPrintOrderTicket ? (
                          <div className="row wrap order-print-row">
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() => printKitchenTicket(o)}
                            >
                              Imprimir (cozinha / térmica)
                            </button>
                            <span className="hint-inline print-hint">
                              Abre o comprovante para a térmica (largura 58/80 mm
                              na aba Cozinha) ou PDF.
                            </span>
                          </div>
                        ) : null}
                        {canRegisterPayment ? (
                          <div className="row wrap">
                            {PAYMENT_METHODS.map((method) => (
                              <button
                                key={`${o.id}-${method}`}
                                type="button"
                                className="btn-sm"
                                onClick={() =>
                                  updateOrderPayment(o.id, method, "pago")
                                }
                              >
                                {method}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="btn-sm"
                              onClick={() =>
                                updateOrderPayment(o.id, null, "pendente")
                              }
                            >
                              Pendente
                            </button>
                            {o.paymentStatus !== "cancelado" ? (
                              <button
                                type="button"
                                className="btn-sm btn-sm-danger"
                                onClick={() =>
                                  updateOrderPayment(o.id, null, "cancelado")
                                }
                              >
                                Cancelar pagamento
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {canChangeOrderStatus ? (
                          <div className="row wrap">
                            {ORDER_STATUS.map((status) => (
                              <button
                                key={status}
                                type="button"
                                className="btn-sm"
                                disabled={status === o.status}
                                onClick={() => updateOrderStatus(o.id, status)}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {activeTab === "relatorios" && (
                <section className="card card-elevated">
                  <h2 className="section-title">Relatórios</h2>
                  <p className="section-desc">
                    Exporte os pedidos do período em CSV (separador ponto e
                    vírgula, UTF-8 com BOM) para abrir no Excel ou Google Planilhas.
                  </p>
                  <div className="row wrap report-export-row">
                    <label className="report-date-field">
                      <span>De</span>
                      <input
                        type="date"
                        value={reportDateFrom}
                        onChange={(e) => setReportDateFrom(e.target.value)}
                      />
                    </label>
                    <label className="report-date-field">
                      <span>Até</span>
                      <input
                        type="date"
                        value={reportDateTo}
                        onChange={(e) => setReportDateTo(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={downloadOrdersCsv}
                    >
                      Baixar CSV
                    </button>
                  </div>
                  <p className="section-desc report-csv-hint">
                    Arquivo em formato planilha, compatível com Excel ou Planilhas
                    Google.
                  </p>
                </section>
              )}

              {activeTab === "cadastros" && (
                <div className="cadastros-grid">
                  <section className="card card-elevated branding-card">
                    <h3>Marca do estabelecimento</h3>
                    <p className="section-desc">
                      Nome e logo aparecem no login, no menu e no cardápio que o
                      cliente abre pelo celular na mesa. Formatos: JPG, PNG, WebP,
                      GIF, AVIF, BMP ou HEIC (até 2,5 MB).
                    </p>
                    <div className="branding-preview-row">
                      {hasEstablishmentLogo ? (
                        <div className="branding-preview-box">
                          <img
                            src={establishmentLogoSrc(establishment.logoUrl)}
                            alt="Logo"
                            className="branding-preview-img"
                            onError={() => setLogoLoadFailed(true)}
                          />
                        </div>
                      ) : (
                        <div className="branding-preview-placeholder">
                          Nenhuma logo enviada
                        </div>
                      )}
                      <div className="branding-actions grid">
                        <label className="btn-secondary branding-file-label">
                          Enviar logo
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/heic,image/heif,.heic,.heif"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) setLogoDraftFile(f);
                            }}
                          />
                        </label>
                        {establishment?.logoUrl ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={removeEstablishmentLogo}
                          >
                            Remover logo
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {logoDraftPreviewUrl ? (
                      <div className="branding-draft-box">
                        <p className="section-desc">
                          Ajuste o enquadramento: zoom e arraste a imagem dentro da caixa.
                        </p>
                        <div
                          className="branding-crop-stage"
                          onMouseDown={(e) => {
                            if (!logoCropMeta) return;
                            setLogoCropDrag({
                              startX: e.clientX,
                              startY: e.clientY,
                              originX: logoCropOffset.x,
                              originY: logoCropOffset.y,
                            });
                          }}
                          onTouchStart={(e) => {
                            if (!logoCropMeta) return;
                            const touch = e.touches?.[0];
                            if (!touch) return;
                            setLogoCropDrag({
                              startX: touch.clientX,
                              startY: touch.clientY,
                              originX: logoCropOffset.x,
                              originY: logoCropOffset.y,
                            });
                          }}
                        >
                          <img
                            src={logoDraftPreviewUrl}
                            alt="Preview da nova logo"
                            className="branding-crop-image"
                            draggable={false}
                            onError={() =>
                              setMessage(
                                "Este navegador não abre este formato de imagem. Guarde como JPG ou PNG e envie de novo."
                              )
                            }
                            style={
                              logoCropMeta
                                ? (() => {
                                    const minSide = Math.min(
                                      logoCropMeta.width,
                                      logoCropMeta.height
                                    );
                                    const previewSize = 140;
                                    const baseScale = previewSize / minSide;
                                    const w =
                                      logoCropMeta.width * baseScale * logoCropZoom;
                                    const h =
                                      logoCropMeta.height * baseScale * logoCropZoom;
                                    const left =
                                      (previewSize - w) / 2 -
                                      logoCropOffset.x * baseScale * logoCropZoom;
                                    const top =
                                      (previewSize - h) / 2 -
                                      logoCropOffset.y * baseScale * logoCropZoom;
                                    return { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px` };
                                  })()
                                : undefined
                            }
                          />
                        </div>
                        <label className="field-label branding-crop-control">
                          Zoom
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="0.01"
                            value={logoCropZoom}
                            onChange={(e) => setLogoCropZoom(Number(e.target.value))}
                            disabled={logoUploadBusy}
                          />
                        </label>
                        <div className="row wrap branding-draft-actions">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={confirmLogoUpload}
                            disabled={logoUploadBusy}
                          >
                            {logoUploadBusy ? "Salvando..." : "Salvar logo"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={cancelLogoDraft}
                            disabled={logoUploadBusy}
                          >
                            Cancelar envio
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <form className="grid branding-name-form" onSubmit={saveEstablishmentBrandingName}>
                      <label className="field-label">
                        Nome exibido (balcão, cardápio no celular, login)
                        <input
                          value={brandNameDraft}
                          onChange={(e) => setBrandNameDraft(e.target.value)}
                          maxLength={120}
                          placeholder="Ex: Pizzaria do João"
                        />
                      </label>
                      <button type="submit" className="btn-primary">
                        Salvar nome
                      </button>
                    </form>
                    <form className="grid branding-delivery-form" onSubmit={saveDeliveryFeeDefault}>
                      <label className="field-label">
                        Taxa fixa de entrega (R$ por pedido delivery)
                        <input
                          type="number"
                          min="0"
                          max="99999"
                          step="0.01"
                          value={deliveryFeeAdminDraft}
                          onChange={(e) => setDeliveryFeeAdminDraft(e.target.value)}
                        />
                      </label>
                      <button type="submit" className="btn-secondary">
                        Salvar taxa de entrega
                      </button>
                    </form>
                    <form className="grid branding-pix-form" onSubmit={saveEstablishmentPix}>
                      <h4 className="branding-pix-title">Pix no cardápio da mesa (opcional)</h4>
                      <p className="section-desc branding-pix-desc">
                        O cliente vê ao pedir pela mesa no celular e pode copiar
                        a chave no app do banco.
                      </p>
                      <label className="field-label">
                        Chave Pix (telefone, e-mail, aleatória ou EVP)
                        <input
                          value={pixChaveDraft}
                          onChange={(e) => setPixChaveDraft(e.target.value)}
                          maxLength={128}
                          placeholder="Ex: +5511999990000 ou e-mail cadastrado"
                          autoComplete="off"
                        />
                      </label>
                      <label className="field-label">
                        Nome do recebedor (como no banco, opcional)
                        <input
                          value={pixNomeRecebedorDraft}
                          onChange={(e) => setPixNomeRecebedorDraft(e.target.value)}
                          maxLength={120}
                          placeholder="Ex: Pizzaria Fulano"
                          autoComplete="off"
                        />
                      </label>
                      <button type="submit" className="btn-secondary">
                        Salvar dados Pix
                      </button>
                    </form>
                  </section>
                  <section className="card card-elevated">
                    <h3>Usuários do painel</h3>
                    <p className="section-desc cadastros-hint">
                      <strong>admin</strong> — dono: financeiro, turno, pagamentos,
                      relatórios, cardápio, cadastros.{" "}
                      <strong>caixa</strong> — atendimento no salão/balcão: mesas,
                      novo pedido, pedidos, impressão térmica (via navegador); não
                      altera pagamentos nem turno. <strong>cozinha</strong> — fila
                      e status. <strong>garçom</strong> — mesas e pedidos no salão.
                    </p>
                    <form className="grid" onSubmit={saveStaffUser}>
                      <input
                        placeholder="Nome"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        required
                      />
                      <input
                        type="email"
                        placeholder="E-mail (login)"
                        value={newStaffEmail}
                        onChange={(e) => setNewStaffEmail(e.target.value)}
                        required
                      />
                      <input
                        type="password"
                        placeholder={
                          editingStaffId
                            ? "Nova senha (opcional)"
                            : "Senha inicial"
                        }
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        required={!editingStaffId}
                        minLength={4}
                      />
                      <label className="field-label">
                        Perfil
                        <select
                          value={newStaffRole}
                          onChange={(e) => setNewStaffRole(e.target.value)}
                        >
                          {USER_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r] || r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="btn-primary">
                        {editingStaffId ? "Salvar usuário" : "Criar usuário"}
                      </button>
                      {editingStaffId ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={resetStaffForm}
                        >
                          Cancelar edição
                        </button>
                      ) : null}
                    </form>
                    <ul className="compact-list">
                      {staffUsers.map((u) => (
                        <li key={u.id}>
                          {u.name} — {u.email}{" "}
                          <span className="mesa-tag">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                          {u.active === false ? (
                            <span className="mesa-tag tag-cancelado">
                              Inativo
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => startEditStaffUser(u)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => toggleStaffUserActive(u)}
                          >
                            {u.active === false ? "Ativar" : "Desativar"}
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => generateStaffRecoveryCode(u)}
                          >
                            Gerar código
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="card card-elevated">
                    <h3>Cardápio</h3>
                    <p className="section-desc cadastros-hint">
                      Produtos e preços ficam na aba{" "}
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => setActiveTab("cardapio")}
                      >
                        Cardápio
                      </button>
                      .
                    </p>
                  </section>
                  <section className="card card-elevated">
                    <h3>Clientes</h3>
                    <form className="grid" onSubmit={createCustomer}>
                      <input
                        placeholder="Nome"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                      />
                      <input
                        placeholder="Telefone"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                      />
                      <input
                        placeholder="Endereço"
                        value={newCustomerAddress}
                        onChange={(e) => setNewCustomerAddress(e.target.value)}
                      />
                      <button type="submit" className="btn-primary">
                        Adicionar
                      </button>
                    </form>
                    <ul className="compact-list">
                      {customers.map((c) => (
                        <li key={c.id}>
                          {c.name} {c.phone || ""}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="card card-elevated">
                    <h3>Nova mesa</h3>
                    <form className="grid" onSubmit={createTable}>
                      <input
                        type="number"
                        min="1"
                        max={9999}
                        placeholder="Número"
                        value={newTableNumber}
                        onChange={(e) => setNewTableNumber(e.target.value)}
                      />
                      <input
                        placeholder="Nome / área (opcional)"
                        value={newTableLabel}
                        onChange={(e) => setNewTableLabel(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={createTableBusy}
                      >
                        {createTableBusy ? "Cadastrando…" : "Cadastrar mesa"}
                      </button>
                    </form>
                  </section>
                </div>
              )}
            </main>

            {closeTableModal ? (
              <div className="overlay-backdrop" onClick={() => setCloseTableModal(null)}>
                <div
                  className="overlay-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3>Fechar comanda da mesa {closeTableModal.number}</h3>
                  <p className="section-desc">
                    Selecione a forma de pagamento para finalizar os pedidos ativos.
                  </p>
                  {!cashCurrent ? (
                    <p className="qr-origin-warn">
                      Turno de caixa fechado: não é possível fechar comanda até o
                      administrador abrir o turno na aba Financeiro.
                    </p>
                  ) : null}
                  {closeTableOrders.length > 0 ? (
                    <div className="close-checkout-summary">
                      <ul className="compact-list close-checkout-list">
                        {closeTableOrders.map((o) => (
                          <li key={o.id}>
                            #{o.id} — {o.customer?.name || "Cliente"} — R${" "}
                            {Number(o.total).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                      <p className="close-checkout-total">
                        Total da comanda: R$ {closeTableTotal.toFixed(2)}
                      </p>
                    </div>
                  ) : (
                    <p className="section-desc">Sem pedidos ativos para esta mesa.</p>
                  )}
                  {managesFinance ? (
                    <div className="close-checkout-adjustments">
                      <label className="field-label">
                        Desconto (R$)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={closeTableDiscount}
                          onChange={(e) => setCloseTableDiscount(e.target.value)}
                          disabled={closeTableSubmitting}
                        />
                      </label>
                      <label className="field-label">
                        Desconto (%)
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={closeTableDiscountPercent}
                          onChange={(e) =>
                            setCloseTableDiscountPercent(e.target.value)
                          }
                          disabled={closeTableSubmitting}
                        />
                      </label>
                      <label className="field-label">
                        Acréscimo (R$)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={closeTableSurcharge}
                          onChange={(e) => setCloseTableSurcharge(e.target.value)}
                          disabled={closeTableSubmitting}
                        />
                      </label>
                      <p className="close-checkout-breakdown">
                        Desconto total: R$ {closeTableTotalDiscount.toFixed(2)} (fixo
                        R$ {closeTableDiscountValue.toFixed(2)} + percentual R${" "}
                        {closeTablePercentDiscountValue.toFixed(2)})
                      </p>
                      {closeTableTotalDiscount > 0 ? (
                        <label className="field-label">
                          Motivo do desconto
                          <input
                            value={closeTableDiscountReason}
                            onChange={(e) =>
                              setCloseTableDiscountReason(e.target.value)
                            }
                            placeholder="Ex: cortesia, cupom, reclamação"
                            disabled={closeTableSubmitting}
                          />
                        </label>
                      ) : null}
                      <p className="close-checkout-net">
                        Total final:{" "}
                        <strong>R$ {closeTableNetTotal.toFixed(2)}</strong>
                      </p>
                    </div>
                  ) : (
                    <p className="section-desc close-checkout-net">
                      Total da comanda:{" "}
                      <strong>R$ {closeTableNetTotal.toFixed(2)}</strong>
                      <span className="hint-inline">
                        {" "}
                        (desconto e acréscimo só no perfil administrador)
                      </span>
                    </p>
                  )}
                  <label className="field-label">
                    Forma de pagamento
                    <select
                      value={closeTablePaymentMethod}
                      onChange={(e) => setCloseTablePaymentMethod(e.target.value)}
                      disabled={closeTableSubmitting}
                    >
                      <option value="pix">Pix</option>
                      <option value="cartao">Cartão</option>
                      <option value="dinheiro">Dinheiro</option>
                    </select>
                  </label>
                  <div className="row wrap">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setCloseTableModal(null)}
                      disabled={closeTableSubmitting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-sm-danger"
                      onClick={() => closeTableCheckout(closeTableModal)}
                      disabled={
                        closeTableSubmitting ||
                        !cashCurrent ||
                        closeTableOrders.length === 0
                      }
                    >
                      {closeTableSubmitting ? "Fechando…" : "Confirmar fechamento"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {message ? (
              <div className="toast" role="status">
                {message}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
