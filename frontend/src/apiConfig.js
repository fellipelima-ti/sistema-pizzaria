function defaultApiUrl() {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:3333`;
  }
  return "http://localhost:3333";
}

/**
 * VITE_API_URL:
 * - absoluta: https://api.dominio.com
 * - relativa: /api (mesmo dominio do site, util com proxy Apache/Nginx)
 */
function resolveApiUrl() {
  const raw = import.meta.env.VITE_API_URL;
  if (raw != null && String(raw).trim() !== "") {
    const s = String(raw).trim().replace(/\/+$/, "");
    if (s.startsWith("/")) {
      if (typeof window !== "undefined" && window.location?.origin) {
        return `${window.location.origin}${s}`;
      }
      return defaultApiUrl();
    }
    return s;
  }
  if (import.meta.env.DEV && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api`;
  }
  return defaultApiUrl();
}

export const API_URL = resolveApiUrl();
