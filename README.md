# Sistema Pizzaria

Painel web + pedidos por **QR na mesa** para pizzarias e restaurantes com cardapio variado. Stack: **React (Vite)**, **Node.js + Express**, **PostgreSQL**, **Prisma**, autenticacao **JWT** e perfis de acesso.

**Manual operacional (equipe / dono):** [MANUAL.md](./MANUAL.md)  
**Proximas entregas sugeridas:** [NEXT_STEPS.md](./NEXT_STEPS.md)  
**Deploy na nuvem (VPS / HostGator):** [deploy/HOSTGATOR-VPS.md](./deploy/HOSTGATOR-VPS.md)  
**QR e HTTPS:** [deploy/QR-E-NUVEM.md](./deploy/QR-E-NUVEM.md)

Apos atualizar o Prisma (`schema.prisma`), rode `npx prisma migrate deploy` e `npx prisma generate` no servidor. No Windows, se `prisma generate` falhar com **EPERM** no `query_engine`, feche processos que usem a pasta e tente de novo.

---

## Funcionalidades principais

| Area | Descricao |
|------|-----------|
| **Administrador (dono)** | Financeiro (turno, pagamentos, resumo), relatorios CSV, cardapio, cadastros, usuarios |
| **Atendimento** (`caixa`) | Mesas, QR, novo pedido, pedidos, impressao via navegador (termica/PDF) |
| **Cozinha** | Fila de pedidos, status, impressao |
| **Garcom** | Mesas e pedidos no salao |
| **Cliente (QR)** | Cardapio publico e pedido na mesa sem login |

Inclui: **nome e logo da marca** (admin em Cadastros), fotos de produtos, disponivel/indisponivel, caixa (abertura/fechamento), integracoes **mock** (WhatsApp / impressora API).

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

API padrao: `http://localhost:3333`.

Carga inicial (so quando `ALLOW_SEED` permitir ou fora de producao):

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

### Usuarios padrao (apos seed)

- `admin@pizzaria.local` / `123456` (administrador)
- `caixa@pizzaria.local` / `123456` (atendimento)
- `cozinha@pizzaria.local` / `123456`
- `garcom@pizzaria.local` / `123456`

Troque as senhas em ambiente real.

---

## Producao — seguranca

| Variavel | Uso |
|----------|-----|
| `NODE_ENV=production` | Obrigatorio na API em producao |
| `CORS_ORIGIN` | **Obrigatorio** se `NODE_ENV=production`: URLs do site do painel, separadas por virgula (sem barra final). Ex: `https://app.exemplo.com,https://www.app.exemplo.com` |
| `JWT_SECRET` | Segredo longo e aleatorio |
| `ALLOW_SEED` | Nao usar em producao (ou `true` so uma vez para migrar, depois remova) |

**Rate limit** (opcional, `.env`): `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_PUBLIC_READ_MAX`, `RATE_LIMIT_PUBLIC_ORDER_MAX` — ver `backend/.env.example`.

Build do front: copie `frontend/.env.production.example` para `.env.production`, defina `VITE_API_URL` e, se preciso, `VITE_PUBLIC_ORIGIN`, depois `npm run build`.

---

## Endpoints uteis

- `GET /health` — saude da API e do banco (`database: up` ou **503** se o Postgres falhar)
- `POST /auth/login` — JWT
- Rotas autenticadas: produtos, clientes, mesas, pedidos, financeiro, usuarios (admin), etc.
- Publicas (cliente QR): `GET /public/table/:token`, `GET /public/products`, `POST /public/orders`

---

## Estrutura do repositorio

```
backend/     API Express + Prisma
frontend/    React + Vite
deploy/      Exemplos Apache, Nginx, guias
MANUAL.md    Uso diario da equipe
```

---

## Proximas melhorias (ideias)

- Recuperacao de senha, edicao de usuarios via API
- Testes automatizados da API
- Integracao ESC/POS ou agente local para termica
- Integracao real WhatsApp Business
"# sistema-pizzaria" 
