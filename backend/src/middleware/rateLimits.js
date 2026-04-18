const rateLimit = require("express-rate-limit");

/** Brute force no login */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 25),
  message: {
    message: "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Leituras públicas (cardápio / mesa) — evita abuso de banda */
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PUBLIC_READ_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
});

/** Criacao de pedido pelo QR — por IP */
const publicOrderCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PUBLIC_ORDER_MAX || 60),
  message: {
    message:
      "Limite de pedidos por hora neste dispositivo. Tente mais tarde ou fale com o estabelecimento.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  publicReadLimiter,
  publicOrderCreateLimiter,
};
