import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { API_URL } from "./apiConfig";
import { establishmentLogoSrc, fetchPublicEstablishment } from "./establishmentApi";
import { buildPixCopiaEColaStatic } from "./pixStaticPayload";
import { productImageSrc } from "./productImageUrl";
import {
  cartLineKey,
  groupProductsByCategory,
  isHalfHalfSizeLabel,
  productHasSizes,
  productSizesPriceSummary,
  unitPriceForCartLine,
} from "./productUtils";
import "./PublicTableOrder.css";

export default function PublicTableOrder() {
  const { token } = useParams();
  const [tableInfo, setTableInfo] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [doneOrderId, setDoneOrderId] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [establishment, setEstablishment] = useState(null);
  const [tableOrders, setTableOrders] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [serviceNote, setServiceNote] = useState("");
  const [closeBillMethod, setCloseBillMethod] = useState("pix");
  const [pixCopied, setPixCopied] = useState(false);
  const [pixPayloadCopied, setPixPayloadCopied] = useState(false);

  const comandaTotal = useMemo(
    () =>
      Number(
        tableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2)
      ),
    [tableOrders]
  );

  const pubName = establishment?.tradeName?.trim() || "Cardápio";
  const pixChave = establishment?.pixChave?.trim() || "";

  const pixCopiaECola = useMemo(() => {
    if (!pixChave) return null;
    const nome =
      establishment?.pixNomeRecebedor?.trim() ||
      establishment?.tradeName?.trim() ||
      pubName;
    return buildPixCopiaEColaStatic({
      chave: pixChave,
      nomeRecebedor: nome,
    });
  }, [
    pixChave,
    establishment?.pixNomeRecebedor,
    establishment?.tradeName,
    pubName,
  ]);

  async function copyPixChave() {
    if (!pixChave) return;
    try {
      await navigator.clipboard.writeText(pixChave);
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 2000);
    } catch {
      setPixCopied(false);
    }
  }

  async function copyPixPayload() {
    if (!pixCopiaECola) return;
    try {
      await navigator.clipboard.writeText(pixCopiaECola);
      setPixPayloadCopied(true);
      window.setTimeout(() => setPixPayloadCopied(false), 2000);
    } catch {
      setPixPayloadCopied(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError("");
      const [tRes, pRes, est] = await Promise.all([
        fetch(`${API_URL}/public/table/${encodeURIComponent(token || "")}`),
        fetch(`${API_URL}/public/products`),
        fetchPublicEstablishment(),
      ]);
      if (cancelled) return;
      setEstablishment(est);
      if (!tRes.ok) {
        const err = await tRes.json().catch(() => ({}));
        setLoadError(err.message || "Mesa não encontrada.");
        return;
      }
      if (!pRes.ok) {
        setLoadError("Não foi possível carregar o cardápio.");
        return;
      }
      setTableInfo(await tRes.json());
      setProducts(await pRes.json());
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    async function loadComanda() {
      const res = await fetch(`${API_URL}/public/table/${encodeURIComponent(token)}/orders`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setTableOrders(Array.isArray(data.orders) ? data.orders : []);
      setServiceRequests(Array.isArray(data.pendingRequests) ? data.pendingRequests : []);
    }
    loadComanda();
    const id = setInterval(loadComanda, 7000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  function addProductToCart(productId, sizeLabel) {
    setCartItems((prev) => {
      const draft = {
        productId,
        sizeLabel: sizeLabel ?? null,
        secondProductId: null,
      };
      const key = cartLineKey(draft);
      const existing = prev.find((i) => cartLineKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          cartLineKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId,
          sizeLabel: sizeLabel ?? null,
          secondProductId: null,
          quantity: 1,
          note: "",
        },
      ];
    });
  }

  function updateCartItem(lineKey, field, value) {
    setCartItems((prev) =>
      prev.map((i) => {
        if (cartLineKey(i) !== lineKey) return i;
        if (field === "quantity") {
          const q = Math.max(1, Number(value) || 1);
          return { ...i, quantity: q };
        }
        return { ...i, [field]: value };
      })
    );
  }

  function removeCartItem(lineKey) {
    setCartItems((prev) => prev.filter((i) => cartLineKey(i) !== lineKey));
  }

  const cartTotal = useMemo(() => {
    let sum = 0;
    for (const row of cartItems) {
      const p = products.find((x) => x.id === row.productId);
      if (!p) continue;
      const p2 = row.secondProductId
        ? products.find((x) => x.id === row.secondProductId)
        : null;
      sum +=
        unitPriceForCartLine(
          p,
          row.sizeLabel,
          row.secondProductId,
          p2
        ) * row.quantity;
    }
    return Number(sum.toFixed(2));
  }, [cartItems, products]);

  const productsByCategory = useMemo(
    () => groupProductsByCategory(products),
    [products]
  );

  async function submitOrder(e) {
    e.preventDefault();
    setSubmitError("");
    if (!token) return;
    if (cartItems.length === 0) {
      setSubmitError("Adicione pelo menos um item.");
      return;
    }
    for (const item of cartItems) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      if (
        productHasSizes(product) &&
        isHalfHalfSizeLabel(item.sizeLabel) &&
        !item.secondProductId
      ) {
        setSubmitError(
          `Escolha o 2º sabor (meia a meia) para "${product.name}" (${String(item.sizeLabel).trim()}).`
        );
        return;
      }
    }
    setSubmitting(true);
    const res = await fetch(`${API_URL}/public/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicToken: token,
        customerName,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        items: cartItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          note: i.note || undefined,
          sizeLabel: i.sizeLabel != null ? String(i.sizeLabel).trim() || undefined : undefined,
          ...(i.secondProductId
            ? { secondProductId: Number(i.secondProductId) }
            : {}),
        })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSubmitError(err.message || "Não foi possível enviar o pedido.");
      return;
    }
    const order = await res.json();
    setDoneOrderId(order.id);
    setCartItems([]);
    setNote("");
    const refresh = await fetch(`${API_URL}/public/table/${encodeURIComponent(token)}/orders`);
    if (refresh.ok) {
      const data = await refresh.json();
      setTableOrders(Array.isArray(data.orders) ? data.orders : []);
      setServiceRequests(Array.isArray(data.pendingRequests) ? data.pendingRequests : []);
    }
  }

  async function sendServiceRequest(requestType) {
    if (!token) return;
    const res = await fetch(
      `${API_URL}/public/table/${encodeURIComponent(token)}/service-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          paymentMethod: requestType === "fechar_conta" ? closeBillMethod : null,
          customerName: customerName.trim() || null,
          note: serviceNote.trim() || null,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSubmitError(err.message || "Não foi possível enviar solicitação.");
      return;
    }
    setSubmitError("");
    setServiceNote("");
    const refresh = await fetch(`${API_URL}/public/table/${encodeURIComponent(token)}/orders`);
    if (refresh.ok) {
      const data = await refresh.json();
      setServiceRequests(Array.isArray(data.pendingRequests) ? data.pendingRequests : []);
    }
  }

  if (loadError) {
    return (
      <div className="public-mesa">
        <div className="public-mesa-card">
          <h1>Pedido na mesa</h1>
          <p className="public-mesa-error">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!tableInfo) {
    return (
      <div className="public-mesa">
        <div className="public-mesa-card">
          <p className="public-mesa-loading">Carregando...</p>
        </div>
      </div>
    );
  }

  if (doneOrderId) {
    return (
      <div className="public-mesa">
        <div className="public-mesa-card public-mesa-success">
          <h1>Pedido enviado</h1>
          <p>
            Seu pedido <strong>#{doneOrderId}</strong> foi recebido na cozinha.
          </p>
          <p className="public-mesa-muted">
            Mesa {tableInfo.number}
            {tableInfo.label ? ` — ${tableInfo.label}` : ""}
          </p>
          <button
            type="button"
            className="public-mesa-btn"
            onClick={() => setDoneOrderId(null)}
          >
            Fazer outro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-mesa">
      <header className="public-mesa-header">
        <div className="public-mesa-brand">
          {establishment?.logoUrl ? (
            <img
              className="public-mesa-brand-logo"
              src={establishmentLogoSrc(establishment.logoUrl)}
              alt=""
            />
          ) : null}
          <div>
            <p className="public-mesa-est-name">{pubName}</p>
            <h1>Mesa {tableInfo.number}</h1>
          </div>
        </div>
        {tableInfo.label ? (
          <p className="public-mesa-sub">{tableInfo.label}</p>
        ) : null}
        <p className="public-mesa-hint">
          Cardápio abaixo — toque nos itens para adicionar. Sem cadastro. Pizza
          em tamanho G: no carrinho, escolha o 2º sabor (meia a meia).
        </p>
        {pixChave ? (
          <div className="public-mesa-pix">
            <h2 className="public-mesa-pix-title">Pix do estabelecimento</h2>
            {establishment?.pixNomeRecebedor?.trim() ? (
              <p className="public-mesa-pix-receiver">
                Recebedor:{" "}
                <strong>{establishment.pixNomeRecebedor.trim()}</strong>
              </p>
            ) : null}
            {pixCopiaECola ? (
              <div className="public-mesa-pix-qr-wrap">
                <div className="public-mesa-pix-qr">
                  <QRCodeSVG
                    value={pixCopiaECola}
                    size={176}
                    level="M"
                    marginSize={4}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    title="Pix — pagamento"
                    className="public-mesa-pix-qr-svg"
                  />
                </div>
                <p className="public-mesa-pix-qr-hint">
                  Escaneie com o app do seu banco para pagar com Pix.
                </p>
                <button
                  type="button"
                  className="public-mesa-pix-copy public-mesa-pix-copy-wide"
                  onClick={copyPixPayload}
                >
                  {pixPayloadCopied ? "Código copiado!" : "Copiar código Pix completo"}
                </button>
              </div>
            ) : (
              <p className="public-mesa-pix-fallback">
                QR Pix não disponível para esta chave (limite de tamanho). Use a
                chave abaixo no app do banco.
              </p>
            )}
            <div className="public-mesa-pix-row">
              <code className="public-mesa-pix-chave">{pixChave}</code>
              <button
                type="button"
                className="public-mesa-pix-copy"
                onClick={copyPixChave}
              >
                {pixCopied ? "Copiado!" : "Copiar chave"}
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <form className="public-mesa-card" onSubmit={submitOrder}>
        <h2 className="public-mesa-h2 public-mesa-h2-lead">Cardápio</h2>
        {productsByCategory.length === 0 ? (
          <p className="public-mesa-empty">Cardápio indisponível no momento.</p>
        ) : (
          <div className="public-mesa-chips-grouped">
            {productsByCategory.map(({ category, items }) => (
              <div key={category} className="public-mesa-chip-block">
                <span className="public-mesa-chip-cat">{category}</span>
                <div className="public-mesa-chips">
                  {items.map((product) =>
                    productHasSizes(product) ? (
                      <div
                        key={product.id}
                        className="public-mesa-chip public-mesa-chip-sizes"
                      >
                        <div className="public-mesa-chip-sizes-head">
                          {product.imageUrl ? (
                            <span className="public-mesa-chip-img-wrap">
                              <img
                                src={productImageSrc(product.imageUrl)}
                                alt=""
                              />
                            </span>
                          ) : null}
                          <span className="public-mesa-chip-name">{product.name}</span>
                        </div>
                        <span className="public-mesa-chip-price-multi">
                          {productSizesPriceSummary(product)}
                        </span>
                        <div className="public-mesa-size-btns">
                          {product.sizes.map((sz) => (
                            <button
                              key={`${product.id}-${sz.label}`}
                              type="button"
                              className="public-mesa-size-btn"
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
                        className="public-mesa-chip"
                        onClick={() => addProductToCart(product.id)}
                      >
                        {product.imageUrl ? (
                          <span className="public-mesa-chip-img-wrap">
                            <img
                              src={productImageSrc(product.imageUrl)}
                              alt=""
                            />
                          </span>
                        ) : null}
                        <span className="public-mesa-chip-text">
                          <span className="public-mesa-chip-name">
                            + {product.name}
                          </span>
                          <span className="public-mesa-chip-price">
                            R$ {Number(product.price).toFixed(2)}
                          </span>
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
          <p className="public-mesa-empty">Toque nos itens para adicionar.</p>
        ) : (
          <ul className="public-mesa-cart">
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
                <li key={lk} className="public-mesa-cart-row">
                  <div>
                    <div className="public-mesa-cart-title">
                      {product.imageUrl ? (
                        <img
                          className="public-mesa-cart-thumb"
                          src={productImageSrc(product.imageUrl)}
                          alt=""
                        />
                      ) : null}
                      <strong>
                        {product.name}
                        {item.secondProductId && secondProd ? (
                          <>
                            {" + "}
                            {secondProd.name}
                          </>
                        ) : null}
                        {item.sizeLabel ? (
                          <span className="public-mesa-cart-size">
                            {" "}
                            — {String(item.sizeLabel).trim()}
                          </span>
                        ) : null}
                      </strong>
                    </div>
                    {needSecond ? (
                      <label className="public-mesa-second-flavor">
                        <span>2º sabor</span>
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
                    <div className="public-mesa-row">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateCartItem(lk, "quantity", e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="public-mesa-linkbtn"
                        onClick={() => removeCartItem(lk)}
                      >
                        Remover
                      </button>
                    </div>
                    <input
                      className="public-mesa-itemnote"
                      placeholder="Obs. do item"
                      value={item.note}
                      onChange={(e) =>
                        updateCartItem(lk, "note", e.target.value)
                      }
                    />
                  </div>
                  <span className="public-mesa-subtotal">
                    R$ {(unit * item.quantity).toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="public-mesa-total">Total: R$ {cartTotal.toFixed(2)}</p>

        <h2 className="public-mesa-h2">Enviar pedido</h2>
        <p className="public-mesa-muted public-mesa-send-intro">
          Preencha seu nome para a cozinha identificar o pedido.
        </p>
        <label className="public-mesa-field">
          <span>Seu nome</span>
          <input
            required
            minLength={2}
            placeholder="Como chamamos você?"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </label>
        <label className="public-mesa-field">
          <span>Telefone (opcional)</span>
          <input
            type="tel"
            placeholder="WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="public-mesa-field">
          <span>Observação do pedido (opcional)</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {submitError ? (
          <p className="public-mesa-error">{submitError}</p>
        ) : null}

        <button
          type="submit"
          className="public-mesa-submit"
          disabled={submitting || cartItems.length === 0}
        >
          {submitting ? "Enviando..." : "Enviar para a cozinha"}
        </button>

        <section className="public-mesa-service">
          <h2 className="public-mesa-h2">Comanda da mesa</h2>
          {tableOrders.length === 0 ? (
            <p className="public-mesa-empty">Ainda não há pedidos ativos nesta mesa.</p>
          ) : (
            <ul className="public-mesa-cart">
              {tableOrders.map((o) => (
                <li key={o.id} className="public-mesa-cart-row">
                  <div>
                    <strong>Pedido #{o.id}</strong>
                    <div className="public-mesa-muted">
                      {o.items
                        ?.map((i) => {
                          const nm = i.product?.name || "";
                          const half = i.secondProduct?.name
                            ? ` + ${i.secondProduct.name}`
                            : "";
                          const sz =
                            i.sizeLabel != null && String(i.sizeLabel).trim()
                              ? ` (${String(i.sizeLabel).trim()})`
                              : "";
                          return `${i.quantity}x ${nm}${half}${sz}`;
                        })
                        .join(" | ")}
                    </div>
                  </div>
                  <span className="public-mesa-subtotal">R$ {Number(o.total).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="public-mesa-total">Total da comanda: R$ {comandaTotal.toFixed(2)}</p>

          <label className="public-mesa-field">
            <span>Recado para equipe (opcional)</span>
            <input
              value={serviceNote}
              onChange={(e) => setServiceNote(e.target.value)}
              placeholder="Ex: sem cebola, pressa, etc."
            />
          </label>
          <div className="public-mesa-actions">
            <button
              type="button"
              className="public-mesa-btn"
              onClick={() => sendServiceRequest("chamar_garcom")}
            >
              Chamar garçom
            </button>
            <select
              value={closeBillMethod}
              onChange={(e) => setCloseBillMethod(e.target.value)}
            >
              <option value="pix">Fechar conta no Pix</option>
              <option value="cartao">Fechar conta no cartão</option>
              <option value="dinheiro">Fechar conta no Dinheiro</option>
            </select>
            <button
              type="button"
              className="public-mesa-btn"
              onClick={() => sendServiceRequest("fechar_conta")}
            >
              Solicitar fechamento
            </button>
          </div>
          {serviceRequests.length > 0 ? (
            <p className="public-mesa-muted">
              Solicitações pendentes: {serviceRequests.length}
            </p>
          ) : null}
        </section>
      </form>
    </div>
  );
}
