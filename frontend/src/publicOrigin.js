const STORAGE_KEY = "pizzaria_qr_public_origin";

function trimBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

/** Origem publicada do front (mesmo host:porta que o cliente abre no celular). */
export function getEnvPublicOrigin() {
  return trimBase(import.meta.env.VITE_PUBLIC_ORIGIN || "");
}

export function getStoredPublicOrigin() {
  if (typeof window === "undefined") return "";
  return trimBase(localStorage.getItem(STORAGE_KEY) || "");
}

export function setStoredPublicOrigin(url) {
  const base = trimBase(url);
  if (base) localStorage.setItem(STORAGE_KEY, base);
  else localStorage.removeItem(STORAGE_KEY);
}

export function isLoopbackHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/**
 * Melhor origem para links/QR da mesa: env > (se localhost: localStorage) > window.location.origin
 */
export function resolveQrPublicOrigin() {
  const env = getEnvPublicOrigin();
  if (env) return env;
  if (isLoopbackHost()) {
    const stored = getStoredPublicOrigin();
    if (stored) return stored;
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function mesaPublicUrl(publicToken, base) {
  const b = trimBase(base);
  if (!b || !publicToken) return "";
  return `${b}/mesa/${publicToken}`;
}
