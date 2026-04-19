require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { authRequired, requireRoles, VALID_ROLES } = require("./middleware/auth");
const {
  loginLimiter,
  publicReadLimiter,
  publicOrderCreateLimiter,
} = require("./middleware/rateLimits");

const ALL_STAFF = ["admin", "caixa", "cozinha", "garcom"];
const ADMIN_ONLY = ["admin"];
const MENU_READ = ["admin", "caixa", "garcom"];
const CUSTOMER_TABLE_READ = ["admin", "caixa", "garcom"];
/** Mesas / QR — atendimento no salão e dono */
const TABLES_READ = ["admin", "caixa", "garcom"];
const ORDER_CREATORS = ["admin", "caixa", "garcom"];
const VALID_ORDER_TYPES = ["balcao", "mesa", "retirada", "entrega"];

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}
/** Pagamentos e turno financeiro: apenas o dono (admin) */
const PAYMENT_STAFF = ["admin"];
const STATUS_STAFF = ["admin", "caixa", "cozinha", "garcom"];
/** Resumo, CSV, abrir/fechar turno, histórico */
const OWNER_FINANCE = ["admin"];
/** Saber se o turno esta aberto (para registrar pedido no balcao) */
const CASH_STATUS_READ = ["admin", "caixa", "garcom"];
const { prisma } = require("./lib/prisma");

const PRODUCT_UPLOAD_DIR = path.join(__dirname, "../uploads/products");

function ensureProductUploadDir() {
  fs.mkdirSync(PRODUCT_UPLOAD_DIR, { recursive: true });
}

function unlinkLocalProductImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return;
  const rel = imageUrl.replace(/^\//, "");
  if (!rel.startsWith("uploads/products/")) return;
  const full = path.resolve(path.join(__dirname, "..", rel));
  const base = path.resolve(PRODUCT_UPLOAD_DIR);
  if (!full.startsWith(base)) return;
  fs.unlink(full, () => {});
}

ensureProductUploadDir();

const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureProductUploadDir();
      cb(null, PRODUCT_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
        ? ext === ".jpeg"
          ? ".jpg"
          : ext
        : ".jpg";
      cb(null, `${crypto.randomBytes(16).toString("hex")}${safe}`);
    },
  }),
  limits: { fileSize: 2.5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      file.mimetype
    );
    cb(null, ok);
  },
});

const BRANDING_UPLOAD_DIR = path.join(__dirname, "../uploads/branding");

function ensureBrandingUploadDir() {
  fs.mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
}

function brandingPathIsInsideBase(fullPath, baseDir) {
  const full = path.resolve(fullPath);
  const base = path.resolve(baseDir);
  if (process.platform === "win32") {
    const f = full.toLowerCase();
    const b = base.toLowerCase();
    return f === b || f.startsWith(`${b}${path.sep}`);
  }
  return full === base || full.startsWith(`${base}${path.sep}`);
}

function unlinkBrandingFile(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return;
  const rel = imageUrl.replace(/^\//, "");
  if (!rel.startsWith("uploads/branding/")) return;
  const full = path.resolve(path.join(__dirname, "..", rel));
  if (!brandingPathIsInsideBase(full, BRANDING_UPLOAD_DIR)) return;
  fs.unlink(full, () => {});
}

ensureBrandingUploadDir();

const MAX_BRANDING_BYTES = Math.floor(2.5 * 1024 * 1024);

function validateImageMagicBytes(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true;
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;
  return false;
}

function normalizeLogoExt(extOrMime, originalname) {
  const allowed = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".avif",
    ".bmp",
    ".heic",
    ".heif",
  ];
  if (typeof extOrMime === "string" && extOrMime.startsWith(".")) {
    const e = extOrMime.toLowerCase();
    if (allowed.includes(e)) return e === ".jpeg" ? ".jpg" : e;
  }
  const mime = String(extOrMime || "").toLowerCase();
  if (mime.includes("jpeg") || mime === "image/jpg") return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("avif")) return ".avif";
  if (mime.includes("bmp")) return ".bmp";
  if (mime.includes("heic")) return ".heic";
  if (mime.includes("heif")) return ".heif";
  const fromName = path.extname(originalname || "").toLowerCase();
  if (allowed.includes(fromName)) return fromName === ".jpeg" ? ".jpg" : fromName;
  return ".png";
}

async function persistEstablishmentLogoBuffer(buffer, extHint, originalname) {
  if (!buffer || buffer.length > MAX_BRANDING_BYTES) {
    const err = new Error("LOGO_TOO_LARGE");
    err.code = "LOGO_TOO_LARGE";
    throw err;
  }
  if (!validateImageMagicBytes(buffer)) {
    const err = new Error("LOGO_BAD_MAGIC");
    err.code = "LOGO_BAD_MAGIC";
    throw err;
  }
  const ext = normalizeLogoExt(extHint, originalname);
  const row = await getOrCreateEstablishment();
  if (row.logoUrl) unlinkBrandingFile(row.logoUrl);
  ensureBrandingUploadDir();
  const filename = `logo-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const fullPath = path.join(BRANDING_UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  const logoUrl = `/uploads/branding/${filename}`;
  try {
    return await prisma.establishmentSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        tradeName: row.tradeName || "Pizzaria",
        logoUrl,
        deliveryFeeDefault: Number(row.deliveryFeeDefault || 0),
      },
      update: { logoUrl },
    });
  } catch (e) {
    fs.unlink(fullPath, () => {});
    throw e;
  }
}

const brandingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BRANDING_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const ext = path.extname(file.originalname || "").toLowerCase();
    const okExt = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".avif",
      ".bmp",
      ".heic",
      ".heif",
    ].includes(ext);
    const okMime = [
      "image/jpeg",
      "image/jpg",
      "image/pjpeg",
      "image/png",
      "image/x-png",
      "image/webp",
      "image/gif",
      "image/avif",
      "image/bmp",
      "image/x-ms-bmp",
      "image/heic",
      "image/heif",
    ].includes(mime);
    if (mime === "application/octet-stream" && okExt) {
      return cb(null, true);
    }
    if (!mime && okExt) {
      return cb(null, true);
    }
    cb(null, okMime || okExt);
  },
});

async function getOrCreateEstablishment() {
  let row = await prisma.establishmentSetting.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.establishmentSetting.create({
      data: { id: 1, tradeName: "Pizzaria" },
    });
  }
  return row;
}

const app = express();
const PORT = Number(process.env.PORT) || 3333;
const HOST = process.env.HOST || "0.0.0.0";

app.set("trust proxy", 1);
const JWT_SECRET = process.env.JWT_SECRET || "pizzaria_local_secret";

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = JWT_SECRET;

function resolveCorsOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const raw = process.env.CORS_ORIGIN;
  if (isProd && (!raw || !String(raw).trim())) {
    console.error(
      "[pizzaria-api] NODE_ENV=production exige CORS_ORIGIN (URLs do frontend, separadas por vírgula).\n" +
        "  Ex: CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com"
    );
    process.exit(1);
  }
  if (raw && String(raw).trim()) {
    return {
      origin: String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  return {};
}

const corsOptions = resolveCorsOptions();

function buildRecoveryCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashRecoveryCode(rawCode) {
  return crypto.createHash("sha256").update(String(rawCode)).digest("hex");
}

async function setUserRecoveryCode(userId) {
  const code = buildRecoveryCode();
  const recoveryCodeHash = hashRecoveryCode(code);
  const recoveryCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.user.update({
    where: { id: Number(userId) },
    data: { recoveryCodeHash, recoveryCodeExpiresAt },
  });
  return code;
}

function dateKeyLocal(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildFinanceSummaryFromOrders(orders, meta = {}) {
  const summary = {
    ...meta,
    totalOrders: orders.length,
    totalRevenue: 0,
    paid: { dinheiro: 0, pix: 0, cartao: 0, total: 0 },
    pending: 0,
    cancelled: 0,
  };

  for (const order of orders) {
    summary.totalRevenue += order.total;
    if (order.paymentStatus === "pago") {
      summary.paid.total += order.total;
      if (order.paymentMethod === "dinheiro") summary.paid.dinheiro += order.total;
      if (order.paymentMethod === "pix") summary.paid.pix += order.total;
      if (order.paymentMethod === "cartao") summary.paid.cartao += order.total;
    } else if (order.paymentStatus === "pendente") {
      summary.pending += order.total;
    } else if (order.paymentStatus === "cancelado") {
      summary.cancelled += order.total;
    }
  }

  summary.totalRevenue = Number(summary.totalRevenue.toFixed(2));
  summary.paid.total = Number(summary.paid.total.toFixed(2));
  summary.paid.dinheiro = Number(summary.paid.dinheiro.toFixed(2));
  summary.paid.pix = Number(summary.paid.pix.toFixed(2));
  summary.paid.cartao = Number(summary.paid.cartao.toFixed(2));
  summary.pending = Number(summary.pending.toFixed(2));
  summary.cancelled = Number(summary.cancelled.toFixed(2));
  return summary;
}

async function assertCashOpen(res) {
  const shift = await prisma.cashShift.findFirst({ where: { status: "aberto" } });
  if (!shift) {
    res.status(403).json({
      message: "Caixa fechado. Abra o caixa para registrar pedidos e receber pagamentos.",
    });
    return false;
  }
  return true;
}

const orderInclude = {
  customer: true,
  table: true,
  items: { include: { product: true, secondProduct: true } },
};

const productSizesInclude = { sizes: { orderBy: { sortOrder: "asc" } } };

/** Tamanhos em que pode haver 2º sabor opcional (meia a meia), ex. G. */
function isHalfHalfSizeLabel(resolvedLabel) {
  const t = String(resolvedLabel ?? "").trim().toLowerCase();
  return t === "g" || t === "grande" || t === "gg";
}

function normalizeProductSizesInput(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  let order = 0;
  for (const row of raw) {
    const label = String(row?.label ?? "").trim();
    const price = Number(row?.price);
    if (!label || !Number.isFinite(price) || price < 0) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, price, sortOrder: order });
    order += 1;
  }
  return out;
}

/**
 * @param {unknown} items
 * @returns {Promise<{ ok: true, orderItems: object[], total: number } | { ok: false, message: string }>}
 */
/**
 * @param {{ requireAvailable?: boolean }} [options]
 */
async function resolveOrderItemsPayload(items, options = {}) {
  const { requireAvailable } = options;
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, message: "Itens são obrigatórios." };
  }
  const productIds = new Set();
  for (const item of items) {
    const a = Number(item.productId);
    if (Number.isFinite(a) && a > 0) productIds.add(a);
    const b = item.secondProductId != null ? Number(item.secondProductId) : NaN;
    if (Number.isFinite(b) && b > 0) productIds.add(b);
  }
  const ids = [...productIds];
  if (!ids.length) {
    return { ok: false, message: "Itens inválidos." };
  }
  const where = { id: { in: ids } };
  if (requireAvailable) where.available = true;
  const products = await prisma.product.findMany({
    where,
    include: productSizesInclude,
  });
  const mapped = items.map((item) => {
      const product = products.find((p) => p.id === Number(item.productId));
      if (!product) return null;
      const quantity = Number(item.quantity || 1);
      if (quantity <= 0) return null;

      const secondIdRaw =
        item.secondProductId != null ? Number(item.secondProductId) : null;
      const secondId =
        secondIdRaw != null && Number.isFinite(secondIdRaw) && secondIdRaw > 0
          ? secondIdRaw
          : null;

      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      const sizeLabelRaw =
        item.sizeLabel != null && String(item.sizeLabel).trim()
          ? String(item.sizeLabel).trim()
          : "";

      let unitPrice = Number(product.price);
      let snapshotSize = null;

      if (sizes.length > 0) {
        if (!sizeLabelRaw) {
          return {
            _err: `Informe o tamanho para "${product.name}" (${sizes
              .map((s) => s.label)
              .join(", ")}).`,
          };
        }
        const match = sizes.find(
          (s) => String(s.label).trim().toLowerCase() === sizeLabelRaw.toLowerCase()
        );
        if (!match) {
          return {
            _err: `Tamanho inválido para "${product.name}". Use: ${sizes
              .map((s) => s.label)
              .join(", ")}.`,
          };
        }
        unitPrice = Number(match.price);
        snapshotSize = String(match.label).trim();

        if (isHalfHalfSizeLabel(snapshotSize)) {
          if (secondId) {
            if (secondId === product.id) {
              return {
                _err: `O 2º sabor deve ser diferente do 1º ("${product.name}").`,
              };
            }
            const p2 = products.find((p) => p.id === secondId);
            if (!p2) {
              return {
                _err: requireAvailable
                  ? "Um dos sabores não está disponível."
                  : "Segundo sabor inválido.",
              };
            }
            const sizes2 = Array.isArray(p2.sizes) ? p2.sizes : [];
            const match2 = sizes2.find(
              (s) =>
                String(s.label).trim().toLowerCase() ===
                String(snapshotSize).toLowerCase()
            );
            if (!match2) {
              return {
                _err: `"${p2.name}" não possui o tamanho "${snapshotSize}" para combinar na meia a meia.`,
              };
            }
            const u2 = Number(match2.price);
            unitPrice = Math.max(unitPrice, u2);
          }
        } else if (secondId) {
          return {
            _err: `Só pizza G (grande) aceita meia a meia. Remova o 2º sabor para "${product.name}" (${snapshotSize}).`,
          };
        }
      } else if (sizeLabelRaw) {
        return { _err: `O item "${product.name}" não possui tamanhos cadastrados.` };
      } else if (secondId) {
        return { _err: `O item "${product.name}" não aceita 2º sabor (meia a meia).` };
      }

      const subtotal = Number((unitPrice * quantity).toFixed(2));
      return {
        productId: product.id,
        secondProductId: secondId,
        quantity,
        note: item.note || null,
        sizeLabel: snapshotSize,
        unitPrice,
        subtotal,
      };
    });

  const errRow = mapped.find((r) => r && r._err);
  if (errRow) {
    return { ok: false, message: errRow._err };
  }

  const orderItems = mapped.filter(Boolean);

  if (!orderItems.length) {
    return {
      ok: false,
      message: requireAvailable
        ? "Um ou mais itens não estão disponíveis no momento."
        : "Itens inválidos.",
    };
  }

  const total = Number(
    orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
  );
  return { ok: true, orderItems, total };
}

function csvEscapeCell(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildOrderWebhookPayload(order) {
  return {
    event: "order.created",
    id: order.id,
    type: order.type,
    orderSource: order.orderSource ?? null,
    status: order.status,
    total: order.total,
    customerName: order.customer?.name ?? null,
    tableNumber: order.table?.number ?? null,
    items: (order.items || []).map((i) => ({
      quantity: i.quantity,
      name: i.product?.name ?? null,
      secondName: i.secondProduct?.name ?? null,
      sizeLabel: i.sizeLabel ?? null,
      note: i.note ?? null,
    })),
    createdAt:
      order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : order.createdAt,
  };
}

function fireOrderCreatedWebhook(order) {
  const url = String(process.env.ORDER_WEBHOOK_URL || "").trim();
  if (!url) return;
  const payload = buildOrderWebhookPayload(order);
  const secret = String(process.env.ORDER_WEBHOOK_SECRET || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Webhook-Secret"] = secret;
  globalThis
    .fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
    .catch((err) => {
      console.warn("[order-webhook]", err?.message || err);
    });
}

app.use(cors(corsOptions));
app.use(express.json({ limit: "4mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.post(
  "/uploads/product-image",
  authRequired,
  requireRoles(...ADMIN_ONLY),
  productImageUpload.single("photo"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Envie uma imagem JPG, PNG, WebP ou GIF (max. 2,5 MB).",
      });
    }
    const imageUrl = `/uploads/products/${req.file.filename}`;
    return res.status(201).json({ imageUrl });
  }
);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return res.json({
      status: "ok",
      service: "pizzaria-api-db",
      database: "up",
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message =
      process.env.NODE_ENV === "production"
        ? "Banco de dados indisponível."
        : String(err?.message || err);
    return res.status(503).json({
      status: "degraded",
      service: "pizzaria-api-db",
      database: "down",
      message,
      checkedAt: new Date().toISOString(),
    });
  }
});

app.get("/public/establishment", publicReadLimiter, async (_req, res) => {
  const row = await getOrCreateEstablishment();
  res.json({
    tradeName: row.tradeName,
    logoUrl: row.logoUrl,
    pixChave: row.pixChave,
    pixNomeRecebedor: row.pixNomeRecebedor,
  });
});

app.get("/public/table/:token", publicReadLimiter, async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) {
    return res.status(400).json({ message: "Link da mesa inválido." });
  }
  const table = await prisma.diningTable.findUnique({
    where: { publicToken: token },
  });
  if (!table) {
    return res.status(404).json({ message: "Mesa não encontrada." });
  }
  if (table.qrEnabled === false) {
    return res.status(403).json({
      message: "Mesa indisponível no momento. Aguarde o atendimento liberar a mesa.",
    });
  }
  return res.json({
    id: table.id,
    number: table.number,
    label: table.label,
  });
});

app.get("/public/products", publicReadLimiter, async (_req, res) => {
  const items = await prisma.product.findMany({
    where: { available: true },
    orderBy: { id: "asc" },
    include: productSizesInclude,
  });
  res.json(items);
});

app.post("/public/orders", publicOrderCreateLimiter, async (req, res) => {
  const { publicToken, customerName, phone, note, items } = req.body;
  const token = String(publicToken || "").trim();
  if (!token) {
    return res.status(400).json({ message: "QR da mesa inválido." });
  }
  const nameRaw = String(customerName || "").trim();
  if (nameRaw.length < 2) {
    return res.status(400).json({ message: "Informe seu nome." });
  }

  const table = await prisma.diningTable.findUnique({
    where: { publicToken: token },
  });
  if (!table) {
    return res.status(404).json({ message: "Mesa não encontrada." });
  }
  if (table.qrEnabled === false) {
    return res.status(403).json({
      message: "Mesa indisponível no momento. Aguarde o atendimento liberar a mesa.",
    });
  }

  const built = await resolveOrderItemsPayload(items, { requireAvailable: true });
  if (!built.ok) {
    return res.status(400).json({ message: built.message });
  }

  const displayName = `${nameRaw} (Mesa ${table.number})`;
  const customer = await prisma.customer.create({
    data: {
      name: displayName,
      phone: phone ? String(phone).trim() || null : null,
    },
  });

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      tableId: table.id,
      type: "mesa",
      orderSource: "qr_mesa",
      note: note ? String(note).trim() || null : null,
      paymentMethod: null,
      paymentStatus: "pendente",
      paidAt: null,
      total: built.total,
      status: "novo",
      items: { create: built.orderItems },
    },
    include: orderInclude,
  });

  setImmediate(() => fireOrderCreatedWebhook(order));

  return res.status(201).json(order);
});

app.get("/public/table/:token/orders", publicReadLimiter, async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Link da mesa inválido." });
  const table = await prisma.diningTable.findUnique({ where: { publicToken: token } });
  if (!table) return res.status(404).json({ message: "Mesa não encontrada." });
  if (table.qrEnabled === false) {
    return res.status(403).json({
      message: "Mesa indisponível no momento. Aguarde o atendimento liberar a mesa.",
    });
  }

  const orders = await prisma.order.findMany({
    where: { tableId: table.id, status: { not: "finalizado" } },
    include: orderInclude,
    orderBy: { id: "desc" },
  });

  const pendingRequests = await prisma.tableServiceRequest.findMany({
    where: { tableId: table.id, status: "novo" },
    orderBy: { id: "desc" },
  });

  return res.json({ orders, pendingRequests });
});

app.post("/public/table/:token/service-request", publicOrderCreateLimiter, async (req, res) => {
  const token = String(req.params.token || "").trim();
  const table = await prisma.diningTable.findUnique({ where: { publicToken: token } });
  if (!table) return res.status(404).json({ message: "Mesa não encontrada." });
  if (table.qrEnabled === false) {
    return res.status(403).json({
      message: "Mesa indisponível no momento. Aguarde o atendimento liberar a mesa.",
    });
  }

  const requestType = String(req.body?.requestType || "chamar_garcom").trim();
  const validTypes = ["chamar_garcom", "fechar_conta"];
  if (!validTypes.includes(requestType)) {
    return res.status(400).json({ message: "Tipo de solicitação inválido." });
  }
  const paymentMethodRaw = req.body?.paymentMethod
    ? String(req.body.paymentMethod).trim()
    : null;
  const validPay = ["dinheiro", "pix", "cartao"];
  const paymentMethod =
    requestType === "fechar_conta" && paymentMethodRaw && validPay.includes(paymentMethodRaw)
      ? paymentMethodRaw
      : null;

  const row = await prisma.tableServiceRequest.create({
    data: {
      tableId: table.id,
      customerName: req.body?.customerName ? String(req.body.customerName).trim() : null,
      requestType,
      paymentMethod,
      note: req.body?.note ? String(req.body.note).trim() : null,
      status: "novo",
    },
    include: { table: true },
  });
  return res.status(201).json(row);
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "E-mail ou senha inválidos." });
  if (user.active === false) {
    return res.status(403).json({ message: "Usuário desativado. Fale com o admin." });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ message: "E-mail ou senha inválidos." });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.post("/auth/recovery/request", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    return res.status(400).json({ message: "Informe o e-mail." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active !== false) {
    const code = await setUserRecoveryCode(user.id);
    const payload = { message: "Se o e-mail existir, um código de recuperação foi gerado." };
    if (process.env.NODE_ENV !== "production") {
      payload.devCode = code;
    }
    return res.json(payload);
  }
  return res.json({ message: "Se o e-mail existir, um código de recuperação foi gerado." });
});

app.post("/auth/recovery/confirm", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: "E-mail, código e nova senha são obrigatórios." });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ message: "Senha mínima: 4 caracteres." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (
    !user ||
    user.active === false ||
    !user.recoveryCodeHash ||
    !user.recoveryCodeExpiresAt ||
    new Date(user.recoveryCodeExpiresAt) < new Date()
  ) {
    return res.status(400).json({ message: "Código inválido ou expirado." });
  }

  const incomingHash = hashRecoveryCode(code);
  if (incomingHash !== user.recoveryCodeHash) {
    return res.status(400).json({ message: "Código inválido ou expirado." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      recoveryCodeHash: null,
      recoveryCodeExpiresAt: null,
    },
  });
  return res.json({ message: "Senha redefinida com sucesso." });
});

app.get(
  "/settings/establishment",
  authRequired,
  requireRoles(...ADMIN_ONLY),
  async (_req, res) => {
    const row = await getOrCreateEstablishment();
    res.json(row);
  }
);

app.patch(
  "/settings/establishment",
  authRequired,
  requireRoles(...ADMIN_ONLY),
  async (req, res) => {
    const { tradeName, clearLogo, deliveryFeeDefault, pixChave, pixNomeRecebedor } = req.body;
    const row = await getOrCreateEstablishment();
    const data = {};
    if (tradeName !== undefined) {
      const t = String(tradeName).trim();
      if (t.length > 0 && t.length <= 120 && t !== row.tradeName) data.tradeName = t;
    }
    if (clearLogo === true && row.logoUrl) {
      unlinkBrandingFile(row.logoUrl);
      data.logoUrl = null;
    }
    if (deliveryFeeDefault !== undefined && deliveryFeeDefault !== null && deliveryFeeDefault !== "") {
      const n = Number(deliveryFeeDefault);
      if (!Number.isFinite(n) || n < 0 || n > 99999) {
        return res.status(400).json({ message: "Taxa de entrega inválida (use valor entre 0 e 99999)." });
      }
      const rounded = Number(n.toFixed(2));
      if (rounded !== Number(row.deliveryFeeDefault || 0)) data.deliveryFeeDefault = rounded;
    }
    if (pixChave !== undefined) {
      const p = String(pixChave || "").trim();
      if (p.length > 128) {
        return res.status(400).json({ message: "Chave Pix muito longa (máx. 128 caracteres)." });
      }
      const nextPix = p.length ? p : null;
      if (nextPix !== (row.pixChave || null)) data.pixChave = nextPix;
    }
    if (pixNomeRecebedor !== undefined) {
      const n = String(pixNomeRecebedor || "").trim();
      if (n.length > 120) {
        return res.status(400).json({ message: "Nome do recebedor Pix muito longo (máx. 120)." });
      }
      const nextNome = n.length ? n : null;
      if (nextNome !== (row.pixNomeRecebedor || null)) data.pixNomeRecebedor = nextNome;
    }
    if (!Object.keys(data).length) {
      return res.json(row);
    }
    const updated = await prisma.establishmentSetting.update({
      where: { id: 1 },
      data,
    });
    res.json(updated);
  }
);

app.post(
  "/settings/establishment-logo-data",
  authRequired,
  requireRoles(...ADMIN_ONLY),
  async (req, res) => {
    const dataUrl = req.body?.dataUrl;
    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({
        message: "Envie uma imagem válida (JPG ou PNG).",
      });
    }
    const m = /^data:image\/([\w.+-]+);base64,([\s\S]*)$/i.exec(dataUrl.trim());
    if (!m) {
      return res.status(400).json({
        message: "Formato de imagem inválido. Use JPG ou PNG.",
      });
    }
    const subtype = m[1].toLowerCase();
    if (subtype === "svg+xml" || subtype.startsWith("svg")) {
      return res.status(400).json({ message: "SVG não é permitido. Use JPG ou PNG." });
    }
    const b64 = m[2].replace(/\s/g, "");
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ message: "Não foi possível ler a imagem. Tente outro arquivo." });
    }
    const pseudoMime = `image/${subtype}`;
    try {
      const updated = await persistEstablishmentLogoBuffer(
        buffer,
        pseudoMime,
        `upload.${subtype}`
      );
      return res.status(201).json({
        tradeName: updated.tradeName,
        logoUrl: updated.logoUrl,
        deliveryFeeDefault: updated.deliveryFeeDefault,
        pixChave: updated.pixChave,
        pixNomeRecebedor: updated.pixNomeRecebedor,
      });
    } catch (e) {
      console.error("[establishment-logo-data]", e);
      if (e.code === "LOGO_TOO_LARGE") {
        return res.status(400).json({ message: "Imagem muito grande (máximo 2,5 MB)." });
      }
      if (e.code === "LOGO_BAD_MAGIC") {
        return res.status(400).json({
          message: "Arquivo não é imagem válida. Use JPG, PNG, WebP ou GIF.",
        });
      }
      return res.status(500).json({ message: "Não foi possível salvar a logo." });
    }
  }
);

app.get(
  "/settings/delivery-fee",
  authRequired,
  requireRoles(...ORDER_CREATORS),
  async (_req, res) => {
    const row = await getOrCreateEstablishment();
    res.json({ deliveryFeeDefault: Number(Number(row.deliveryFeeDefault || 0).toFixed(2)) });
  }
);

app.post(
  "/uploads/branding-logo",
  authRequired,
  requireRoles(...ADMIN_ONLY),
  (req, res, next) => {
    brandingUpload.single("logo")(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Arquivo muito grande (máximo 2,5 MB).",
          });
        }
        return res.status(400).json({
          message: err.message || "Falha ao receber o arquivo.",
        });
      }
      return next(err);
    });
  },
  async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        message:
          "Envie uma imagem JPG, PNG, WebP ou GIF (máx. 2,5 MB). Selecione outro arquivo ou formato.",
      });
    }
    try {
      const updated = await persistEstablishmentLogoBuffer(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
      return res.status(201).json({
        tradeName: updated.tradeName,
        logoUrl: updated.logoUrl,
        deliveryFeeDefault: updated.deliveryFeeDefault,
        pixChave: updated.pixChave,
        pixNomeRecebedor: updated.pixNomeRecebedor,
      });
    } catch (e) {
      console.error("[branding-logo]", e);
      if (e.code === "LOGO_TOO_LARGE") {
        return res.status(400).json({ message: "Arquivo muito grande (máximo 2,5 MB)." });
      }
      if (e.code === "LOGO_BAD_MAGIC") {
        return res.status(400).json({
          message: "Arquivo não é imagem válida. Use JPG ou PNG.",
        });
      }
      return res.status(500).json({
        message: "Não foi possível salvar a logo. Tente novamente.",
      });
    }
  }
);

app.get("/users", authRequired, requireRoles(...ADMIN_ONLY), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
  res.json(users);
});

app.post("/users", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nome, e-mail e senha são obrigatórios." });
  }
  const r = String(role || "garcom").trim();
  if (!VALID_ROLES.includes(r)) {
    return res.status(400).json({
      message: `Perfil inválido. Use: ${VALID_ROLES.join(", ")}.`,
    });
  }
  try {
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        role: r,
        active: true,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
    return res.status(201).json(user);
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "E-mail já cadastrado." });
    }
    throw e;
  }
});

app.patch("/users/:id", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Usuário inválido." });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: "Usuário não encontrado." });
  }

  const data = {};
  if (req.body.name !== undefined) {
    const nextName = String(req.body.name).trim();
    if (!nextName) return res.status(400).json({ message: "Nome inválido." });
    data.name = nextName;
  }
  if (req.body.email !== undefined) {
    const nextEmail = String(req.body.email).trim().toLowerCase();
    if (!nextEmail) return res.status(400).json({ message: "E-mail inválido." });
    data.email = nextEmail;
  }
  if (req.body.role !== undefined) {
    const nextRole = String(req.body.role).trim();
    if (!VALID_ROLES.includes(nextRole)) {
      return res.status(400).json({
        message: `Perfil inválido. Use: ${VALID_ROLES.join(", ")}.`,
      });
    }
    data.role = nextRole;
  }
  if (req.body.password !== undefined && req.body.password !== "") {
    const raw = String(req.body.password);
    if (raw.length < 4) {
      return res.status(400).json({ message: "Senha mínima: 4 caracteres." });
    }
    data.passwordHash = await bcrypt.hash(raw, 10);
  }
  if (req.body.active !== undefined) {
    const nextActive = Boolean(req.body.active);
    if (req.user.id === id && nextActive === false) {
      return res.status(400).json({ message: "Você não pode desativar sua própria conta." });
    }
    if (existing.role === "admin" && nextActive === false) {
      const activeAdmins = await prisma.user.count({
        where: { role: "admin", active: true },
      });
      if (activeAdmins <= 1) {
        return res.status(400).json({ message: "Não é possível desativar o último admin ativo." });
      }
    }
    data.active = nextActive;
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ message: "Nada para atualizar." });
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
    return res.json(updated);
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "E-mail já cadastrado." });
    }
    throw e;
  }
});

app.post(
  "/users/:id/recovery-code",
  authRequired,
  requireRoles(...ADMIN_ONLY),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Usuário inválido." });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    if (user.active === false) {
      return res.status(400).json({ message: "Usuário inativo. Ative antes de gerar código." });
    }
    const code = await setUserRecoveryCode(user.id);
    return res.json({
      message: "Código de recuperação gerado (15 min).",
      code,
      expiresInMinutes: 15,
    });
  }
);

app.delete("/users/:id", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Usuário inválido." });

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: "Usuário não encontrado." });
  }
  if (req.user.id === id) {
    return res.status(400).json({ message: "Você não pode excluir sua própria conta." });
  }
  if (existing.role === "admin") {
    const activeAdmins = await prisma.user.count({
      where: { role: "admin", active: true },
    });
    if (existing.active && activeAdmins <= 1) {
      return res.status(400).json({ message: "Não é possível excluir o último admin ativo." });
    }
  }

  const linkedCash = await prisma.cashShift.count({ where: { userId: id } });
  if (linkedCash > 0) {
    return res.status(409).json({
      message: "Usuário com histórico de caixa não pode ser excluído. Desative-o.",
    });
  }

  await prisma.user.delete({ where: { id } });
  return res.status(204).send();
});

app.get("/products", authRequired, requireRoles(...MENU_READ), async (_req, res) => {
  const items = await prisma.product.findMany({
    orderBy: { id: "asc" },
    include: productSizesInclude,
  });
  res.json(items);
});

app.post("/products", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const { name, price, category, imageUrl, available, sizes } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: "Nome e preço são obrigatórios." });
  }
  const img =
    imageUrl != null && String(imageUrl).trim()
      ? String(imageUrl).trim()
      : null;
  const sizeRows = normalizeProductSizesInput(sizes);
  let basePrice = Number(price);
  if (sizeRows.length) {
    const minP = Math.min(...sizeRows.map((s) => s.price));
    if (Number.isFinite(minP)) basePrice = minP;
  }
  const product = await prisma.product.create({
    data: {
      name,
      price: basePrice,
      category: category || "outros",
      imageUrl: img,
      available: available === undefined ? true : Boolean(available),
      sizes:
        sizeRows.length > 0
          ? { create: sizeRows.map((s) => ({ label: s.label, price: s.price, sortOrder: s.sortOrder })) }
          : undefined,
    },
    include: productSizesInclude,
  });
  return res.status(201).json(product);
});

app.patch("/products/:id", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Produto inválido." });
  const { name, price, category, imageUrl, available, sizes } = req.body;

  const existing = await prisma.product.findUnique({
    where: { id },
    include: productSizesInclude,
  });
  if (!existing) {
    return res.status(404).json({ message: "Produto não encontrado." });
  }

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (price !== undefined) data.price = Number(price);
  if (category !== undefined) data.category = String(category).trim() || "outros";
  if (imageUrl !== undefined) {
    const nextUrl =
      imageUrl === null || imageUrl === ""
        ? null
        : String(imageUrl).trim() || null;
    if (existing.imageUrl && existing.imageUrl !== nextUrl) {
      unlinkLocalProductImage(existing.imageUrl);
    }
    data.imageUrl = nextUrl;
  }
  if (available !== undefined) data.available = Boolean(available);

  const sizeRows = sizes !== undefined ? normalizeProductSizesInput(sizes) : null;
  if (sizeRows && sizeRows.length) {
    const minP = Math.min(...sizeRows.map((s) => s.price));
    if (Number.isFinite(minP)) data.price = minP;
  }

  if (!Object.keys(data).length && sizeRows === null) {
    return res.status(400).json({ message: "Nada para atualizar." });
  }
  if (data.name === "") {
    return res.status(400).json({ message: "Nome inválido." });
  }
  if (data.price !== undefined && (Number.isNaN(data.price) || data.price < 0)) {
    return res.status(400).json({ message: "Preço inválido." });
  }
  try {
    const product = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.product.update({ where: { id }, data });
      }
      if (sizeRows !== null) {
        await tx.productSize.deleteMany({ where: { productId: id } });
        if (sizeRows.length) {
          await tx.productSize.createMany({
            data: sizeRows.map((s) => ({
              productId: id,
              label: s.label,
              price: s.price,
              sortOrder: s.sortOrder,
            })),
          });
        }
      }
      return tx.product.findUnique({
        where: { id },
        include: productSizesInclude,
      });
    });
    return res.json(product);
  } catch (e) {
    if (e.code === "P2025") {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    throw e;
  }
});

app.delete("/products/:id", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Produto inválido." });
  try {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (existing?.imageUrl) unlinkLocalProductImage(existing.imageUrl);
    await prisma.product.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) {
    if (e.code === "P2003") {
      return res.status(409).json({
        message: "Este produto já foi usado em pedidos e não pode ser excluído.",
      });
    }
    if (e.code === "P2025") {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    throw e;
  }
});

app.get("/customers", authRequired, requireRoles(...CUSTOMER_TABLE_READ), async (_req, res) => {
  const customers = await prisma.customer.findMany({ orderBy: { id: "asc" } });
  res.json(customers);
});

app.post("/customers", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ message: "Nome do cliente é obrigatório." });
  const customer = await prisma.customer.create({ data: { name, phone, address } });
  return res.status(201).json(customer);
});

app.get("/tables", authRequired, requireRoles(...TABLES_READ), async (_req, res) => {
  const tables = await prisma.diningTable.findMany({ orderBy: { number: "asc" } });
  const activeOrders = await prisma.order.findMany({
    where: {
      tableId: { not: null },
      status: { not: "finalizado" },
      paymentStatus: { not: "cancelado" },
    },
    include: orderInclude,
    orderBy: { id: "desc" },
  });
  const byTable = {};
  for (const o of activeOrders) {
    if (!byTable[o.tableId]) byTable[o.tableId] = [];
    byTable[o.tableId].push(o);
  }
  const serviceRequests = await prisma.tableServiceRequest.findMany({
    where: { status: "novo" },
    orderBy: { id: "desc" },
  });
  const requestByTable = {};
  for (const s of serviceRequests) {
    if (!requestByTable[s.tableId]) requestByTable[s.tableId] = [];
    requestByTable[s.tableId].push(s);
  }
  res.json(
    tables.map((t) => ({
      ...t,
      openOrders: byTable[t.id] || [],
      serviceRequests: requestByTable[t.id] || [],
    }))
  );
});

app.patch(
  "/tables/:id/close-checkout",
  authRequired,
  requireRoles(...TABLES_READ),
  async (req, res) => {
    if (!(await assertCashOpen(res))) return;
    const tableId = Number(req.params.id);
    if (!tableId) return res.status(400).json({ message: "Mesa inválida." });

    const paymentMethod = String(req.body?.paymentMethod || "").trim();
    const validPay = ["dinheiro", "pix", "cartao"];
    if (!validPay.includes(paymentMethod)) {
      return res.status(400).json({ message: "Forma de pagamento inválida." });
    }

    const activeOrders = await prisma.order.findMany({
      where: {
        tableId,
        status: { not: "finalizado" },
        paymentStatus: { not: "cancelado" },
      },
      orderBy: { id: "asc" },
    });
    if (!activeOrders.length) {
      return res.status(400).json({ message: "Não há comanda ativa para esta mesa." });
    }

    const discount = Math.max(0, Number(req.body?.discount || 0));
    const discountPercent = Math.max(0, Number(req.body?.discountPercent || 0));
    const surcharge = Math.max(0, Number(req.body?.surcharge || 0));
    if (Number.isNaN(discount) || Number.isNaN(discountPercent) || Number.isNaN(surcharge)) {
      return res.status(400).json({ message: "Desconto/acréscimo inválidos." });
    }
    if (discountPercent > 100) {
      return res.status(400).json({ message: "Percentual de desconto deve ser de 0 a 100." });
    }

    const grossTotal = Number(
      activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2)
    );
    const percentDiscountValue = Number(((grossTotal * discountPercent) / 100).toFixed(2));
    const totalDiscount = Number((discount + percentDiscountValue).toFixed(2));
    const discountReason =
      totalDiscount > 0 ? String(req.body?.discountReason || "").trim() : "";
    if (totalDiscount > 0 && !discountReason) {
      return res.status(400).json({ message: "Informe o motivo do desconto." });
    }

    const netTotal = Number(Math.max(0, grossTotal - totalDiscount + surcharge).toFixed(2));

    let running = 0;
    const perOrderTotals = activeOrders.map((o, idx) => {
      if (idx === activeOrders.length - 1) {
        return Number((netTotal - running).toFixed(2));
      }
      const share = grossTotal > 0 ? Number(o.total || 0) / grossTotal : 1 / activeOrders.length;
      const amount = Number((netTotal * share).toFixed(2));
      running += amount;
      return amount;
    });

    const now = new Date();
    await prisma.$transaction([
      ...activeOrders.map((order, idx) =>
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: "finalizado",
            paymentStatus: "pago",
            paymentMethod,
            paidAt: now,
            total: perOrderTotals[idx],
            note:
              totalDiscount > 0
                ? [order.note, `Desconto: ${discountReason}`].filter(Boolean).join(" | ")
                : order.note,
          },
        })
      ),
      prisma.tableServiceRequest.updateMany({
        where: { tableId, status: "novo", requestType: "fechar_conta" },
        data: { status: "atendido", attendedAt: now },
      }),
      prisma.diningTable.update({
        where: { id: tableId },
        data: { qrEnabled: false },
      }),
      ...(totalDiscount > 0
        ? [
            prisma.tableCheckoutDiscountLog.create({
              data: {
                tableId,
                userId: req.user?.id || null,
                paymentMethod,
                grossTotal,
                discountFixed: discount,
                discountPercent,
                discountPercentValue: percentDiscountValue,
                totalDiscount,
                surcharge,
                netTotal,
                discountReason,
              },
            }),
          ]
        : []),
    ]);

    return res.json({
      message: "Comanda fechada. QR da mesa bloqueado até o atendimento liberar novamente.",
      closedOrders: activeOrders.length,
      paymentMethod,
      grossTotal,
      discount,
      discountPercent,
      percentDiscountValue,
      totalDiscount,
      discountReason: discountReason || null,
      surcharge,
      netTotal,
    });
  }
);

app.patch(
  "/tables/:id/qr-enabled",
  authRequired,
  requireRoles(...TABLES_READ),
  async (req, res) => {
    const tableId = Number(req.params.id);
    if (!tableId) return res.status(400).json({ message: "Mesa inválida." });

    if (req.body?.qrEnabled === undefined) {
      return res.status(400).json({ message: "Informe qrEnabled." });
    }

    const qrEnabled = Boolean(req.body.qrEnabled);

    const updated = await prisma.diningTable.update({
      where: { id: tableId },
      data: { qrEnabled },
    });

    return res.json(updated);
  }
);

app.get(
  "/finance/table-checkout-discounts",
  authRequired,
  requireRoles(...OWNER_FINANCE),
  async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const rows = await prisma.tableCheckoutDiscountLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        table: { select: { id: true, number: true, label: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return res.json(rows);
  }
);

app.patch(
  "/table-service-requests/:id/attend",
  authRequired,
  requireRoles(...TABLES_READ),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Solicitação inválida." });
    try {
      const existing = await prisma.tableServiceRequest.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ message: "Solicitação não encontrada." });
      }

      if (existing.requestType === "fechar_conta") {
        const closeData = {
          status: "finalizado",
          paymentStatus: "pago",
          paidAt: new Date(),
        };
        if (existing.paymentMethod) {
          closeData.paymentMethod = existing.paymentMethod;
        }
        await prisma.order.updateMany({
          where: {
            tableId: existing.tableId,
            status: { not: "finalizado" },
            paymentStatus: { not: "cancelado" },
          },
          data: closeData,
        });
        // Bloqueia QR até o atendimento liberar novamente.
        await prisma.diningTable.update({
          where: { id: existing.tableId },
          data: { qrEnabled: false },
        });
      }

      const updated = await prisma.tableServiceRequest.update({
        where: { id },
        data: { status: "atendido", attendedAt: new Date() },
      });
      return res.json(updated);
    } catch (e) {
      if (e.code === "P2025") {
        return res.status(404).json({ message: "Solicitação não encontrada." });
      }
      throw e;
    }
  }
);

app.post("/tables", authRequired, requireRoles(...ADMIN_ONLY), async (req, res) => {
  const { number, label } = req.body;
  const n = Number(number);
  if (!n || n < 1) {
    return res.status(400).json({ message: "Número da mesa inválido." });
  }
  const exists = await prisma.diningTable.findUnique({ where: { number: n } });
  if (exists) {
    return res.status(400).json({ message: "Já existe mesa com este número." });
  }
  const table = await prisma.diningTable.create({
    data: { number: n, label: label || null, qrEnabled: true },
  });
  return res.status(201).json(table);
});

app.get("/orders", authRequired, requireRoles(...ALL_STAFF), async (_req, res) => {
  const orders = await prisma.order.findMany({
    include: orderInclude,
    orderBy: { id: "desc" },
  });
  res.json(orders);
});

app.post("/orders", authRequired, requireRoles(...ORDER_CREATORS), async (req, res) => {
  if (!(await assertCashOpen(res))) return;

  const { customerId, type, tableId, note, paymentMethod, items, deliveryPhone, deliveryAddress } =
    req.body;
  if (!customerId || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: "Cliente e itens são obrigatórios." });
  }

  const orderType = String(type || "balcao").trim();
  if (!VALID_ORDER_TYPES.includes(orderType)) {
    return res.status(400).json({ message: "Tipo de pedido inválido." });
  }

  let resolvedTableId = null;
  if (orderType === "mesa") {
    if (!tableId) {
      return res.status(400).json({ message: "Selecione a mesa para comanda." });
    }
    const table = await prisma.diningTable.findUnique({
      where: { id: Number(tableId) },
    });
    if (!table) {
      return res.status(400).json({ message: "Mesa não encontrada." });
    }
    resolvedTableId = table.id;
  }

  const built = await resolveOrderItemsPayload(items);
  if (!built.ok) {
    return res.status(400).json({ message: built.message });
  }

  let deliveryFee = 0;
  let deliveryAddrSnapshot = null;
  if (orderType === "entrega") {
    const est = await getOrCreateEstablishment();
    deliveryFee = Number(Number(est.deliveryFeeDefault || 0).toFixed(2));
    const addr = String(deliveryAddress ?? "").trim();
    const phoneDigits = normalizePhoneDigits(deliveryPhone);
    if (addr.length < 5) {
      return res.status(400).json({
        message: "Informe o endereço de entrega (rua, número, bairro).",
      });
    }
    if (phoneDigits.length < 10) {
      return res.status(400).json({
        message: "Informe um telefone de contato com DDD (mínimo 10 dígitos).",
      });
    }
    deliveryAddrSnapshot = addr;
    const cust = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
    if (!cust) {
      return res.status(400).json({ message: "Cliente não encontrado." });
    }
    await prisma.customer.update({
      where: { id: cust.id },
      data: {
        phone: String(deliveryPhone).trim().slice(0, 40),
        address: addr.slice(0, 500),
      },
    });
  }

  const orderTotal = Number((built.total + deliveryFee).toFixed(2));

  const staffRole = req.user?.role || "admin";
  const validPay = ["dinheiro", "pix", "cartao"];
  let resolvedPayment = null;
  if (staffRole === "admin" && paymentMethod) {
    const pm = String(paymentMethod).trim();
    if (validPay.includes(pm)) resolvedPayment = pm;
  }

  const order = await prisma.order.create({
    data: {
      customerId: Number(customerId),
      tableId: resolvedTableId,
      type: orderType,
      orderSource: "staff",
      note: note || null,
      paymentMethod: resolvedPayment,
      paymentStatus: resolvedPayment ? "pago" : "pendente",
      paidAt: resolvedPayment ? new Date() : null,
      deliveryFee,
      deliveryAddress: deliveryAddrSnapshot,
      total: orderTotal,
      status: "novo",
      items: { create: built.orderItems },
    },
    include: orderInclude,
  });

  setImmediate(() => fireOrderCreatedWebhook(order));

  return res.status(201).json(order);
});

app.patch("/orders/:id/payment", authRequired, requireRoles(...PAYMENT_STAFF), async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, paymentStatus } = req.body;
  const validMethods = ["dinheiro", "pix", "cartao"];
  const validStatus = ["pendente", "pago", "cancelado"];

  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    return res.status(400).json({ message: "Forma de pagamento inválida." });
  }
  if (paymentStatus && !validStatus.includes(paymentStatus)) {
    return res.status(400).json({ message: "Status de pagamento inválido." });
  }

  const nextStatus = paymentStatus || "pendente";
  if (nextStatus === "pago" && !(await assertCashOpen(res))) return;

  const order = await prisma.order.update({
    where: { id: Number(id) },
    data: {
      paymentMethod: paymentMethod || null,
      paymentStatus: nextStatus,
      paidAt: nextStatus === "pago" ? new Date() : null,
    },
    include: orderInclude,
  });
  return res.json(order);
});

app.patch("/orders/:id/status", authRequired, requireRoles(...STATUS_STAFF), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatus = ["novo", "preparo", "entrega", "finalizado"];
  if (!validStatus.includes(status)) {
    return res.status(400).json({ message: "Status inválido." });
  }
  const order = await prisma.order.update({
    where: { id: Number(id) },
    data: { status },
    include: { customer: true, table: true },
  });
  return res.json(order);
});

app.get("/finance/summary", authRequired, requireRoles(...OWNER_FINANCE), async (req, res) => {
  const { date } = req.query;
  const baseDate = date ? new Date(String(date)) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return res.status(400).json({ message: "Data inválida. Use YYYY-MM-DD." });
  }

  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(baseDate);
  end.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: "asc" },
  });

  const summary = buildFinanceSummaryFromOrders(orders, {
    date: start.toISOString().slice(0, 10),
  });
  return res.json(summary);
});

/** Série diária e totais para dashboard (admin): ?days=7..90 (padrão 30) */
app.get("/finance/analytics", authRequired, requireRoles(...OWNER_FINANCE), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: {
      id: true,
      total: true,
      type: true,
      paymentStatus: true,
      paymentMethod: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const dayMap = new Map();
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = dateKeyLocal(cursor);
    dayMap.set(key, { date: key, paidTotal: 0, ordersCount: 0, pendingTotal: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const byType = {
    balcao: 0,
    mesa: 0,
    retirada: 0,
    entrega: 0,
    outros: 0,
  };

  const paidByMethod = { dinheiro: 0, pix: 0, cartao: 0 };
  let paidGrand = 0;
  let pendingGrand = 0;

  for (const o of orders) {
    const key = dateKeyLocal(o.createdAt);
    const bucket = dayMap.get(key);
    if (bucket) {
      bucket.ordersCount += 1;
      if (o.paymentStatus === "pago") bucket.paidTotal += o.total;
      else if (o.paymentStatus === "pendente") bucket.pendingTotal += o.total;
    }
    if (o.paymentStatus === "pago") {
      paidGrand += o.total;
      const pm = o.paymentMethod;
      if (pm === "dinheiro") paidByMethod.dinheiro += o.total;
      else if (pm === "pix") paidByMethod.pix += o.total;
      else if (pm === "cartao") paidByMethod.cartao += o.total;
      const t = String(o.type || "balcao");
      if (Object.prototype.hasOwnProperty.call(byType, t) && t !== "outros") {
        byType[t] += o.total;
      } else {
        byType.outros += o.total;
      }
    } else if (o.paymentStatus === "pendente") {
      pendingGrand += o.total;
    }
  }

  const series = Array.from(dayMap.values()).map((b) => ({
    date: b.date,
    paidTotal: Number(b.paidTotal.toFixed(2)),
    ordersCount: b.ordersCount,
    pendingTotal: Number(b.pendingTotal.toFixed(2)),
  }));

  const totals = {
    paidTotal: Number(paidGrand.toFixed(2)),
    pendingTotal: Number(pendingGrand.toFixed(2)),
    ordersCount: orders.length,
    paidByMethod: {
      dinheiro: Number(paidByMethod.dinheiro.toFixed(2)),
      pix: Number(paidByMethod.pix.toFixed(2)),
      cartao: Number(paidByMethod.cartao.toFixed(2)),
    },
 };

  const byTypeRounded = Object.fromEntries(
    Object.entries(byType).map(([k, v]) => [k, Number(v.toFixed(2))])
  );

  return res.json({
    days,
    from: dateKeyLocal(start),
    to: dateKeyLocal(end),
    series,
    totals,
    byType: byTypeRounded,
  });
});

app.get("/reports/orders-csv", authRequired, requireRoles(...OWNER_FINANCE), async (req, res) => {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  if (!from || !to) {
    return res.status(400).json({ message: "Informe from e to (YYYY-MM-DD)." });
  }
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ message: "Datas inválidas." });
  }
  if (end < start) {
    return res.status(400).json({ message: "Data final antes da inicial." });
  }

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lte: end } },
    include: orderInclude,
    orderBy: { id: "asc" },
  });

  const sep = ";";
  const headers = [
    "id",
    "data_hora",
    "cliente",
    "tipo",
    "mesa",
    "status",
    "pagamento",
    "forma_pagamento",
    "taxa_entrega",
    "endereco_entrega",
    "total",
    "itens",
    "obs_pedido",
  ];
  const lines = [headers.join(sep)];
  for (const o of orders) {
    const itemSummary = o.items
      .map((i) => {
        let nm = i.product?.name || "";
        if (i.secondProduct?.name) nm = `${nm} + ${i.secondProduct.name}`;
        const sz = i.sizeLabel ? ` (${String(i.sizeLabel).trim()})` : "";
        return `${i.quantity}x ${nm}${sz}`;
      })
      .join(" | ");
    const mesa = o.table ? String(o.table.number) : "";
    const row = [
      o.id,
      o.createdAt.toISOString(),
      csvEscapeCell(o.customer?.name),
      csvEscapeCell(o.type),
      mesa,
      csvEscapeCell(o.status),
      csvEscapeCell(o.paymentStatus),
      csvEscapeCell(o.paymentMethod || ""),
      String(Number(o.deliveryFee || 0).toFixed(2)).replace(".", ","),
      csvEscapeCell(o.deliveryAddress || ""),
      String(Number(o.total).toFixed(2)).replace(".", ","),
      csvEscapeCell(itemSummary),
      csvEscapeCell(o.note || ""),
    ];
    lines.push(row.join(sep));
  }

  const bom = "\uFEFF";
  const fname = `pedidos_${from}_${to}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.send(bom + lines.join("\n"));
});

app.get("/cash/current", authRequired, requireRoles(...CASH_STATUS_READ), async (_req, res) => {
  const shift = await prisma.cashShift.findFirst({
    where: { status: "aberto" },
    orderBy: { openedAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(shift);
});

app.post("/cash/open", authRequired, requireRoles(...OWNER_FINANCE), async (req, res) => {
  const existing = await prisma.cashShift.findFirst({ where: { status: "aberto" } });
  if (existing) {
    return res.status(400).json({ message: "Já existe um caixa aberto." });
  }
  const { openingBalance, openNote } = req.body;
  const shift = await prisma.cashShift.create({
    data: {
      status: "aberto",
      openingBalance: Number(openingBalance || 0),
      openNote: openNote || null,
      userId: req.user.id,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return res.status(201).json(shift);
});

app.post("/cash/close", authRequired, requireRoles(...OWNER_FINANCE), async (req, res) => {
  const shift = await prisma.cashShift.findFirst({
    where: { status: "aberto" },
    orderBy: { openedAt: "desc" },
  });
  if (!shift) {
    return res.status(400).json({ message: "Nenhum caixa aberto para fechar." });
  }
  const { closingBalance, closeNote } = req.body;
  const closedAt = new Date();
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: shift.openedAt, lte: closedAt } },
    orderBy: { createdAt: "asc" },
  });
  const summary = buildFinanceSummaryFromOrders(orders, {
    periodStart: shift.openedAt.toISOString(),
    periodEnd: closedAt.toISOString(),
    cashShiftId: shift.id,
  });
  const expectedCash =
    Number(shift.openingBalance) + Number(summary.paid.dinheiro);
  const counted =
    closingBalance === undefined || closingBalance === null || closingBalance === ""
      ? null
      : Number(closingBalance);
  const difference =
    counted === null ? null : Number((counted - expectedCash).toFixed(2));

  const updated = await prisma.cashShift.update({
    where: { id: shift.id },
    data: {
      status: "fechado",
      closedAt,
      closingBalance: counted,
      closeNote: closeNote || null,
      summary: {
        ...summary,
        openingBalance: shift.openingBalance,
        expectedCashInDrawer: Number(expectedCash.toFixed(2)),
        countedCashInDrawer: counted,
        cashDifference: difference,
      },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return res.json(updated);
});

app.get("/cash/shifts", authRequired, requireRoles(...OWNER_FINANCE), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const shifts = await prisma.cashShift.findMany({
    where: { status: "fechado" },
    orderBy: { closedAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(shifts);
});

app.post("/seed", async (_req, res) => {
  const allowSeedFlag = ["true", "1", "yes"].includes(
    String(process.env.ALLOW_SEED || "")
      .trim()
      .toLowerCase()
  );
  const seedAllowed = allowSeedFlag || process.env.NODE_ENV !== "production";
  if (!seedAllowed) {
    return res.status(403).json({
      message:
        "Seed desabilitado em produção. Defina ALLOW_SEED=true temporariamente se precisar.",
    });
  }

  try {
  const admin = await prisma.user.findUnique({
    where: { email: "admin@pizzaria.local" },
  });
  if (!admin) {
    const passwordHash = await bcrypt.hash("123456", 10);
    await prisma.user.create({
      data: {
        name: "Administrador",
        email: "admin@pizzaria.local",
        role: "admin",
        passwordHash,
      },
    });
  }

  const seedStaff = [
    { name: "Atendimento", email: "caixa@pizzaria.local", role: "caixa" },
    { name: "Cozinha", email: "cozinha@pizzaria.local", role: "cozinha" },
    { name: "Garçom", email: "garcom@pizzaria.local", role: "garcom" },
  ];
  for (const u of seedStaff) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (!exists) {
      const passwordHash = await bcrypt.hash("123456", 10);
      await prisma.user.create({
        data: { name: u.name, email: u.email, role: u.role, passwordHash },
      });
    }
  }

  if ((await prisma.customer.count()) === 0) {
    await prisma.customer.createMany({
      data: [
        { name: "Cliente Balcão" },
        { name: "João da Entrega", phone: "11999999999", address: "Rua A, 100" },
      ],
    });
  }

  if ((await prisma.product.count()) === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          name: "Pizza Calabresa",
          price: 42.9,
          category: "pizza",
          sizes: {
            create: [
              { label: "P", price: 42.9, sortOrder: 0 },
              { label: "M", price: 54.9, sortOrder: 1 },
              { label: "G", price: 66.9, sortOrder: 2 },
            ],
          },
        },
      });
      await tx.product.create({
        data: {
          name: "Pizza Frango com Catupiry",
          price: 49.9,
          category: "pizza",
          sizes: {
            create: [
              { label: "P", price: 49.9, sortOrder: 0 },
              { label: "M", price: 61.9, sortOrder: 1 },
              { label: "G", price: 73.9, sortOrder: 2 },
            ],
          },
        },
      });
      await tx.product.createMany({
        data: [
          { name: "Pastel de Carne", price: 9.5, category: "pastel" },
          { name: "Pastel de Queijo", price: 8.5, category: "pastel" },
          { name: "Refrigerante 2L", price: 12, category: "bebidas" },
          { name: "Suco Natural 500ml", price: 10, category: "bebidas" },
        ],
      });
    });
  }

  if ((await prisma.diningTable.count()) === 0) {
    await prisma.diningTable.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        qrEnabled: true,
      })),
    });
  }

  await prisma.establishmentSetting.upsert({
    where: { id: 1 },
    create: { id: 1, tradeName: "Pizzaria" },
    update: {},
  });

  res.json({ message: "Seed concluido com sucesso." });
  } catch (err) {
    console.error("[seed]", err);
    res.status(500).json({
      message: err?.message || "Erro ao executar seed.",
    });
  }
});

app.post(
  "/integrations/whatsapp/quote",
  authRequired,
  requireRoles(...ORDER_CREATORS),
  (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ message: "Telefone e mensagem obrigatórios." });
  }
  return res.json({ status: "queued", provider: "mock", phone, message });
  }
);

app.post(
  "/integrations/printer/print",
  authRequired,
  requireRoles("admin", "cozinha", "caixa"),
  (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ message: "Conteúdo obrigatório para impressão." });
  }
  return res.json({ status: "printed", printer: "cozinha-local", preview: content });
  }
);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Arquivo muito grande (max. 2,5 MB)." });
    }
    return res.status(400).json({ message: "Falha no envio da imagem." });
  }
  next(err);
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`API pizzaria em http://${HOST}:${PORT}`);
    if (process.env.NODE_ENV !== "production" && !String(process.env.CORS_ORIGIN || "").trim()) {
      console.warn(
        "[pizzaria-api] CORS aberto (modo desenvolvimento). Em produção use NODE_ENV=production e CORS_ORIGIN."
      );
    }
  });
}

module.exports = { app };
