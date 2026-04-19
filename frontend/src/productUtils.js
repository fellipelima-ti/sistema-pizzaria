/** Agrupa produtos por categoria (ordenado) para cardápio e pedidos. */
export function groupProductsByCategory(products) {
  const map = new Map();
  for (const p of products) {
    const key = (p.category || "outros").toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b, "pt"));
  return keys.map((category) => ({
    category,
    items: map.get(category).sort((a, b) => a.name.localeCompare(b.name, "pt")),
  }));
}

export function productHasSizes(product) {
  return Array.isArray(product?.sizes) && product.sizes.length > 0;
}

/** Preço unitário do item no carrinho (considera tamanho, se houver). */
export function unitPriceForProductLine(product, sizeLabel) {
  if (!product) return 0;
  if (!productHasSizes(product)) return Number(product.price) || 0;
  const raw = sizeLabel != null ? String(sizeLabel).trim() : "";
  if (!raw) return Number(product.price) || 0;
  const s = product.sizes.find(
    (x) => String(x.label).trim().toLowerCase() === raw.toLowerCase()
  );
  return s ? Number(s.price) || 0 : Number(product.price) || 0;
}

/** Tamanhos em que pode haver 2º sabor opcional (meia a meia), ex. G ou Grande. */
export function isHalfHalfSizeLabel(sizeLabel) {
  const t = String(sizeLabel ?? "").trim().toLowerCase();
  return t === "g" || t === "grande" || t === "gg";
}

/** Preço unitário no carrinho: com 2º sabor no G, usa o maior preço entre os dois. */
export function unitPriceForCartLine(
  mainProduct,
  sizeLabel,
  secondProductId,
  secondProduct
) {
  const u1 = unitPriceForProductLine(mainProduct, sizeLabel);
  if (
    !secondProductId ||
    !secondProduct ||
    !isHalfHalfSizeLabel(sizeLabel)
  ) {
    return u1;
  }
  const u2 = unitPriceForProductLine(secondProduct, sizeLabel);
  return Math.max(u1, u2 || 0);
}

/** Texto para cardápio: "P R$ … · M R$ …" ou preço único. */
export function productSizesPriceSummary(product) {
  if (!productHasSizes(product)) {
    return `R$ ${Number(product.price).toFixed(2)}`;
  }
  return product.sizes
    .map((s) => `${String(s.label).trim()} R$ ${Number(s.price).toFixed(2)}`)
    .join(" · ");
}

export function cartLineKey(item) {
  const sec = item.secondProductId != null ? String(item.secondProductId) : "";
  return `${item.productId}::__${item.sizeLabel ?? ""}::__${sec}`;
}
