# QR da mesa na nuvem (HTTPS)

O QR codifica um link **fixo por mesa**:

```text
https://SEU-DOMINIO-DO-SITE/mesa/TOKEN_PUBLICO
```

O celular do cliente abre o **mesmo frontend** (React) que o painel; a rota `/mesa/:token` mostra o cardápio e envia o pedido para a API (`/public/...`).

## O que precisa estar certo

1. **Domínio público com HTTPS**  
   O cliente usa a câmera do celular na internet ou no Wi‑Fi da loja. Use certificado válido (Let's Encrypt / Certbot).

2. **SPA (React Router)**  
   Ao abrir `/mesa/abc123`, o servidor deve devolver `index.html`, não 404.  
   - **Apache**: `.htaccess` em `frontend/public/` (copiado para o `dist`) + `AllowOverride All` — já incluso no projeto.  
   - **Nginx**: veja `deploy/nginx-spa.example.conf`.

3. **API acessível pelo celular**  
   No build do frontend, `VITE_API_URL` deve ser a URL que o **navegador do cliente** consegue chamar:
   - API em subdomínio: `VITE_API_URL=https://api.seudominio.com`  
   - API no mesmo site (proxy): `VITE_API_URL=/api` (e proxy no Apache/Nginx para o Node na porta interna).

4. **CORS no backend**  
   Em `.env` da API: `CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com` (as origens exatas do **site**, não da API).

5. **URL que entra no QR (`VITE_PUBLIC_ORIGIN`)**  
   - Se o garçom abre o painel em `https://pizzaria.com` e o cliente também deve usar `https://pizzaria.com`, **não é obrigatório** definir nada: o sistema usa `window.location.origin` e o QR fica correto.  
   - Defina `VITE_PUBLIC_ORIGIN` no **build** quando:
     - o painel é aberto por um endereço **diferente** do link do cliente (ex.: você usa `https://www.` mas o QR deve ser sem `www`, ou o contrário);
     - você gera links impressos e quer **forçar** sempre o mesmo domínio.

   Exemplo em `frontend/.env.production`:

   ```env
   VITE_PUBLIC_ORIGIN=https://seudominio.com
   VITE_API_URL=https://api.seudominio.com
   ```

   Depois: `npm run build` e publique o novo `dist/`.

6. **Imagens do cardápio**  
   Fotos em `/uploads/products/...` são servidas pela **API**. Com `VITE_API_URL` apontando para essa API (ou proxy que inclua `/uploads`), as imagens aparecem na página pública da mesa.

## Fluxo resumido

| Quem        | Abre                         | Precisa de                          |
|------------|------------------------------|-------------------------------------|
| Garçom/ADM | `https://seudominio.com`     | Front + login JWT                   |
| Cliente    | `https://seudominio.com/mesa/TOKEN` | Front + `VITE_API_URL` + CORS |

## Referências no repositório

- Deploy passo a passo (VPS / HostGator): `deploy/HOSTGATOR-VPS.md`  
- Apache site estático: `deploy/apache-frontend-static.example.conf`  
- Apache proxy `/api`: `deploy/apache-same-domain-api.example.conf`  
- Nginx: `deploy/nginx-spa.example.conf`

## Problemas comuns

| Sintoma | Causa provável |
|--------|-----------------|
| QR abre 404 | Servidor não redireciona rotas para `index.html` |
| Cardápio não carrega | `VITE_API_URL` errado, CORS, ou API fora do ar |
| Imagem quebrada | API não expõe `/uploads` ou URL da API incorreta no build |
| Mixed content | Site em HTTPS mas API em HTTP — use HTTPS na API ou proxy no mesmo host |
