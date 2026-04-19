# Fluxo completo — VPS (ordem recomendada)

Use este arquivo como **roteiro único**. Detalhes extras: `DEPLOY-VPS.md` na raiz do repositório.

**Dois lugares:** comandos com caminho `C:\...` ou `scp` rodam no **PowerShell do Windows**. Comandos com `cd /opt/...` ou `docker` rodam na **VPS** (SSH, Linux).

---

## A. Antes de tudo (DNS e VPS)

1. VPS com **Docker** e **Docker Compose v2**.
2. Firewall: **80/tcp** e **443/tcp** liberados (Let’s Encrypt e site).
3. No painel DNS (ex.: Hostinger): registro **A** `@` → **IP público da VPS**; **www** → mesmo IP ou CNAME para `@`.
4. Confirmação: `dig +short SEU_DOMINIO A` deve mostrar o IP da VPS.

---

## B. Projeto na VPS

Pasta padrão neste guia: **`/opt/sistema-pizzaria`** (ajuste se usar outro caminho).

- **Git na VPS:** `git clone ... && cd sistema-pizzaria` (ou `cd /opt/sistema-pizzaria` se já clonou aí).
- **Sem Git:** copie a pasta do PC com **WinSCP** ou, no **PowerShell do Windows** (na pasta do projeto no PC):

```powershell
cd $HOME\Desktop\sistema-pizzaria
scp .\backend\src\server.js root@IP:/opt/sistema-pizzaria/backend/src/
# ... outros arquivos; ou envie a pasta inteira com WinSCP
```

**Não** sobrescreva o `.env` da VPS com o do PC se já tiver segredos definidos.

---

## C. Arquivo `.env` (na raiz, ao lado de `docker-compose.prod.yml`)

```bash
cd /opt/sistema-pizzaria
cp deploy/env.production.example .env
nano .env
```

**Obrigatório editar:**

| Variável | Regra |
|----------|--------|
| `POSTGRES_PASSWORD` | Use **só letras e números** (evita `#` que no `.env` vira **comentário** e corta a linha). |
| `DATABASE_URL` | Mesma senha que `POSTGRES_PASSWORD`; host **`db`**; `.../pizzaria?schema=public`. |
| `JWT_SECRET` | `openssl rand -hex 32` no Linux/Mac. |
| `CORS_ORIGIN` | URL **exata** do painel no navegador, com `https://` (e `www` se usar). Várias URLs separadas por vírgula **sem espaço**. |
| `DOMAIN` | Domínio sem `https://` (ex.: `paraisodapizza.shop`). |
| `CADDY_EMAIL` | E-mail válido (Let’s Encrypt). |

Primeira subida opcional: descomente **`ALLOW_SEED=true`** só até rodar o seed (passo G).

---

## D. Subir o stack

Na **VPS**:

```bash
cd /opt/sistema-pizzaria
chmod +x deploy/vps-compose.sh   # uma vez
./deploy/vps-compose.sh
```

Equivale a: `docker compose -f docker-compose.prod.yml up -d --build`

Aguarde o build. Logs: `docker compose -f docker-compose.prod.yml logs -f api` (Ctrl+C para sair).

---

## E. Se aparecer Prisma **P1000**

- Senha em `DATABASE_URL` ≠ senha real do Postgres **dentro do volume**, ou linha `.env` cortada por `#`.
- **Correção rápida (apaga o banco):** alinhe `POSTGRES_PASSWORD` + `DATABASE_URL` no `.env`, depois:

```bash
cd /opt/sistema-pizzaria
docker compose -f docker-compose.prod.yml down
docker volume ls | grep pizzaria_pg
docker volume rm NOME_DO_VOLUME_pizzaria_pg_data
./deploy/vps-compose.sh
```

---

## F. Conferir API

Na **VPS**:

```bash
curl -sS https://SEU_DOMINIO/api/health
```

Deve ser **JSON**, não HTML 502. Se **502**, veja `docker compose -f docker-compose.prod.yml logs --tail=40 api` (API caindo / P1000).

---

## G. Seed (usuários + dados demo) — **uma vez**

1. No `.env`: `ALLOW_SEED=true`
2. Na **VPS**: `docker compose -f docker-compose.prod.yml up -d api`
3. Na **VPS**:

```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://SEU_DOMINIO/api/seed"
```

HTTP **200** e mensagem de sucesso. **403** = API sem `ALLOW_SEED` (releia `.env` e `up -d api`).

4. No `.env`: `ALLOW_SEED=false` (ou remova a linha).
5. `docker compose -f docker-compose.prod.yml up -d api`

**Login:** `admin@pizzaria.local` / `123456` — troque a senha em seguida.

Conferir usuários:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U postgres -d pizzaria -c 'SELECT email, role FROM "User";'
```

---

## H. Atualizar código depois (PC → VPS)

### H1. Com Git na VPS (recomendado)

1. **No PC:** commit + push para o remoto (`git push`).
2. **Na VPS (SSH):**

```bash
cd /opt/sistema-pizzaria
git pull
./deploy/vps-compose.sh
```

O script faz `up -d --build` (recompila **api** e **web**, roda migrations na subida da API).

**Só para ir mais rápido** (código já no disco, sem rebuild de tudo o que não mudou):

```bash
cd /opt/sistema-pizzaria
git pull
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d api web caddy
```

Use **só `api`** se alterou apenas `backend/`; **só `web`** se alterou apenas `frontend/`.

### H2. Sem Git (cópia do PC)

1. **PowerShell no Windows:** `scp`/WinSCP da pasta do projeto para o mesmo caminho na VPS (ex.: `/opt/sistema-pizzaria`). **Não** sobrescreva o `.env` da VPS.
2. **Na VPS:** mesmo comando que em H1 (`./deploy/vps-compose.sh` ou `build api web` + `up -d`).

### H3. Depois de publicar

No navegador: **Ctrl+F5** (evita cache de JS/CSS antigo).

**Limite de login:** muitas tentativas → rate limit; na VPS: `docker compose -f docker-compose.prod.yml restart api`.

---

## I. Pós go-live

- Backup: `deploy/backup-db.sh` + cron (`DEPLOY-VPS.md`).
- `ALLOW_SEED` desligado.
- Senhas fortes (Postgres, JWT, admin).

---

## Referência rápida — onde rodar o comando

| Ação | Onde |
|------|------|
| `cd C:\Users\...\Desktop\sistema-pizzaria`, `scp ...` | **PowerShell no Windows** |
| `cd /opt/sistema-pizzaria`, `docker compose`, `curl` para o domínio | **SSH na VPS** |
| `cd C:\Users\...` no servidor | **Errado** — esse caminho não existe no Linux |
