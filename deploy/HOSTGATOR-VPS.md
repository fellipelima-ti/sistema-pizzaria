# Deploy completo na HostGator (VPS Linux)

Use **VPS ou dedicado**. Hospedagem **compartilhada** não roda Node.js nem este projeto inteiro.

## Visão geral

| O que            | Onde |
|------------------|------|
| Painel + QR mesa | `https://seudominio.com` (arquivos estáticos do `frontend/dist`) |
| API              | `https://api.seudominio.com` (Node atrás do Apache como proxy) |
| Banco            | PostgreSQL no **mesmo VPS** (ou serviço externo, se preferir) |

Ajuste `seudominio.com` e `api.seudominio.com` para os seus nomes.

## 1. DNS (painel HostGator / registrador)

- Registro **A** `@` → IP público da VPS  
- Registro **A** `www` → mesmo IP  
- Registro **A** `api` → mesmo IP  

Propagação pode levar algumas horas.

## 2. No servidor (SSH como root ou sudo)

### Pacotes (Ubuntu/Debian — nomes podem variar na AlmaLinux da HostGator)

```bash
apt update
apt install -y postgresql postgresql-contrib apache2 certbot python3-certbot-apache
a2enmod proxy proxy_http rewrite ssl headers
systemctl restart apache2
```

### Node.js (LTS)

Use [NodeSource](https://github.com/nodesource/distributions) ou `nvm` e instale Node **20 ou 22 LTS**.

```bash
npm install -g pm2
```

### PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER pizzaria WITH PASSWORD 'SENHA_FORTE';"
sudo -u postgres psql -c "CREATE DATABASE pizzaria OWNER pizzaria;"
```

`DATABASE_URL` (no `.env` do backend):

```env
postgresql://pizzaria:SENHA_FORTE@127.0.0.1:5432/pizzaria?schema=public
```

## 3. Backend (API)

Garanta que a pasta `backend/uploads/products` exista e que o usuário do Node/PM2 possa **gravar** nela (fotos do cardápio).

```bash
cd /var/www
git clone SEU_REPO sistema-pizzaria
cd sistema-pizzaria/backend
cp .env.example .env
nano .env   # DATABASE_URL, JWT_SECRET, PORT=3333, HOST=127.0.0.1, NODE_ENV=production
# Obrigatório: CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com (origens exatas do site do painel)
mkdir -p uploads/products
chmod -R u+rwX uploads
npm ci
npx prisma migrate deploy
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # seguir a linha que o comando mostrar
```

Teste no servidor: `curl -s http://127.0.0.1:3333/health`

Primeira carga de dados: em **produção** o endpoint `POST /seed` fica **bloqueado** salvo se no `.env` existir `ALLOW_SEED=true`. Use uma vez, confirme o login, remova a variável e reinicie o PM2. Em desenvolvimento (`NODE_ENV` diferente de `production`) o seed continua liberado.

## 4. Apache — API (proxy)

Crie um virtual host para `api.seudominio.com` apontando para `http://127.0.0.1:3333/`. Veja comentários em:

- `deploy/apache-api-reverse-proxy.example.conf`

Ative o site, `apache2ctl configtest`, `systemctl reload apache2`.

## 5. Frontend (build no seu PC ou no servidor)

No **mesmo** domínio público que os clientes usam no navegador:

Arquivo `frontend/.env.production`:

Subdomínio da API:

```env
VITE_API_URL=https://api.seudominio.com
VITE_PUBLIC_ORIGIN=https://seudominio.com
```

**Um domínio só** (proxy `/api` no mesmo VirtualHost do site): no Apache use `ProxyPass /api/ http://127.0.0.1:3333/` (veja `deploy/apache-same-domain-api.example.conf`). No build:

```env
VITE_API_URL=/api
VITE_PUBLIC_ORIGIN=https://seudominio.com
```

```bash
cd frontend
npm ci
npm run build
```

Envie o conteúdo de `frontend/dist/` para `/var/www/pizzaria/dist` no VPS (rsync, scp, FTP/SFTP).

## 6. Apache — site estático

Virtual host para `seudominio.com` com `DocumentRoot` na pasta do `dist` e `AllowOverride All` (para o `.htaccess` do React Router e das URLs `/mesa/...` do QR). Veja:

- `deploy/apache-frontend-static.example.conf`
- QR e variáveis de build: `deploy/QR-E-NUVEM.md`

## 7. HTTPS

```bash
certbot --apache -d seudominio.com -d www.seudominio.com
certbot --apache -d api.seudominio.com
```

## 8. Firewall

Abra **22**, **80**, **443**. Feche a porta **3333** para a internet se a API só for acessada via Apache no mesmo servidor.

## Checklist final

- [ ] `https://api.seudominio.com/health` retorna JSON  
- [ ] `https://seudominio.com` abre o login  
- [ ] QR da mesa usa `https://seudominio.com/mesa/...` (via `VITE_PUBLIC_ORIGIN`)  
- [ ] Celular na internet consegue pedir (sem depender de IP da rede local)  

## Problemas comuns

- **CORS / API**: o front deve chamar exatamente a URL em `VITE_API_URL`; qualquer mudança exige **novo** `npm run build`.  
- **502 na API**: PM2 parado, Node não escutando em `127.0.0.1:3333`, ou `ProxyPass` errado.  
- **404 ao atualizar página no React**: falta `.htaccess` no `dist` ou `AllowOverride All`.  

Suporte HostGator costuma ajudar em Apache/SSL na VPS; aplicação Node e Prisma ficam por sua conta ou de um desenvolvedor.
