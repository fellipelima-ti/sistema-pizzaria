# Sistema Pizzaria

Painel web + pedidos por **QR na mesa** para pizzarias e restaurantes com cardápio variado. Stack: **React (Vite)**, **Node.js + Express**, **PostgreSQL**, **Prisma**, autenticação **JWT** e perfis de acesso.

**Manual operacional (equipe / dono):** [MANUAL.md](./MANUAL.md)  
**Próximas entregas sugeridas:** [NEXT_STEPS.md](./NEXT_STEPS.md)  
**Deploy na nuvem (VPS / HostGator):** [deploy/HOSTGATOR-VPS.md](./deploy/HOSTGATOR-VPS.md)  
**QR e HTTPS:** [deploy/QR-E-NUVEM.md](./deploy/QR-E-NUVEM.md)

Após atualizar o Prisma (`schema.prisma`), rode `npx prisma migrate deploy` e `npx prisma generate` no servidor. No Windows, se `prisma generate` falhar com **EPERM** no `query_engine`, feche processos que usem a pasta e tente de novo.

---

## Funcionalidades principais

| Área | Descrição |
|------|-----------|
| **Administrador (dono)** | Financeiro (turno, pagamentos, resumo), relatórios CSV, cardápio, cadastros, usuários |
| **Atendimento** (`caixa`) | Mesas, QR, novo pedido, pedidos, impressão via navegador (térmica/PDF) |
| **Cozinha** | Fila de pedidos, status, impressão |
| **Garçom** | Mesas e pedidos no salão |
| **Cliente (QR)** | Cardápio público e pedido na mesa sem login |

Inclui: **nome e logo da marca** (admin em Cadastros), fotos de produtos, disponível/indisponível, caixa (abertura/fechamento), integrações **mock** (WhatsApp / impressora API).

---

## Requisitos

- **Node.js 20+**
- **PostgreSQL** (local, Docker ou hospedado)

---

## Desenvolvimento local

### 1) Banco (Docker)

Na raiz do projeto:

```bash
docker compose up -d
```

### 2) Backend

```bash
cd backend
cp .env.example .env
# Ajuste DATABASE_URL e JWT_SECRET
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

API padrão: `http://localhost:3333`.

Carga inicial (só quando `ALLOW_SEED` permitir ou fora de produção):

```bash
curl -X POST http://localhost:3333/seed
```

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Painel: `http://localhost:5173`.

**QR no celular na mesma rede:** o Vite usa `host: true`. Com o PC em `localhost`, defina no painel (Mesas) a URL da rede, ex. `http://192.168.x.x:5173`, ou `VITE_PUBLIC_ORIGIN` em `frontend/.env`.

### Usuários padrão (após seed)

- `admin@pizzaria.local` / `123456` (administrador)
- `caixa@pizzaria.local` / `123456` (atendimento)
- `cozinha@pizzaria.local` / `123456`
- `garcom@pizzaria.local` / `123456`

Troque as senhas em ambiente real.

---

## Produção — segurança

| Variável | Uso |
|----------|-----|
| `NODE_ENV=production` | Obrigatório na API em produção |
| `CORS_ORIGIN` | **Obrigatório** se `NODE_ENV=production`: URLs do site do painel, separadas por vírgula (sem barra final). Ex: `https://app.exemplo.com,https://www.app.exemplo.com` |
| `JWT_SECRET` | Segredo longo e aleatório |
| `ALLOW_SEED` | Não usar em produção (ou `true` só uma vez para migrar, depois remova) |

**Rate limit** (opcional, `.env`): `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_READ_MAX`, `RATE_LIMIT_PUBLIC_ORDER_MAX` — ver `backend/.env.example`.

Build do front: copie `frontend/.env.production.example` para `.env.production`, defina `VITE_API_URL` e, se preciso, `VITE_PUBLIC_ORIGIN`, depois `npm run build`.

---

## Endpoints úteis

- `GET /health` — saúde da API e do banco (`database: up` ou **503** se o Postgres falhar)
- `POST /auth/login` — JWT
- Rotas autenticadas: produtos, clientes, mesas, pedidos, financeiro, usuários (admin), etc.
- Públicas (cliente QR): `GET /public/table/:token`, `GET /public/products`, `POST /public/orders`

---

## Estrutura do repositório

```
backend/     API Express + Prisma
frontend/    React + Vite
deploy/      Exemplos Apache, Nginx, guias
.github/     CI (GitHub Actions)
MANUAL.md    Uso diário da equipe
```

---

## Integração contínua (CI)

Com o repositório no GitHub, o workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) roda em **push** e **pull request** (branches `main` e `master`): no **backend**, `npx prisma generate` e `npm test`; no **frontend**, `npm run lint` e `npm run build`.

---

## Próximas melhorias (ideias)

- Mais testes de API (ex.: `PATCH /products` com tamanhos) e testes no frontend (Vitest)
- Integração ESC/POS ou agente local para térmica
- Integração real WhatsApp Business
