import { API_URL } from "./apiConfig";

/** URL absoluta para exibir imagem do produto (upload local ou URL externa). */
export function productImageSrc(imageUrl) {
  if (imageUrl == null || !String(imageUrl).trim()) return null;
  const u = String(imageUrl).trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const path = u.startsWith("/") ? u : `/${u}`;
  return `${API_URL}${path}`;
}
