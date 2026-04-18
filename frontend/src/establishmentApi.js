import { API_URL } from "./apiConfig";
import { productImageSrc } from "./productImageUrl";

export async function fetchPublicEstablishment() {
  try {
    const res = await fetch(`${API_URL}/public/establishment`);
    if (!res.ok) throw new Error("establishment");
    return await res.json();
  } catch {
    return {
      tradeName: "Pizzaria",
      logoUrl: null,
      pixChave: null,
      pixNomeRecebedor: null,
    };
  }
}

/** URL absoluta para tag <img> da logo (upload local ou http). */
export function establishmentLogoSrc(logoUrl) {
  return productImageSrc(logoUrl);
}
