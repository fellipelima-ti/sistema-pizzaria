# Deploy na VPS do cliente

Este guia sobe **PostgreSQL + API Node + Nginx** com o **frontend estático** e o **mesmo domínio** para painel, QR (`/mesa/...`) e API em **`/api`**.

## Requisitos na VPS

- Ubuntu 22.04 LTS (ou similar) com **Docker** e **Docker Compose v2** instalados.
- **2 GB RAM** ou mais recomendado.
- Porta **80** (e **443** após TLS) liberada no firewall.

## 1. Enviar o projeto

Na VPS (exemplo):

```bash
git clone <seu-repositorio> sistema-pizzaria
cd sistema-pizzaria
```

Ou copie a pasta do projeto via `scp`/SFTP.

## 2. Variáveis de ambiente

Na **raiz do repositório** (onde está `docker-compose.prod.yml`):

```bash
cp deploy/env.production.example .env
nano .env   # ou vim
```

Ajuste obrigatoriamente:

| Variável | Descrição |
|----------|-----------|
| `POSTGRES_PASSWORD` | Senha forte do banco. |
| `DATABASE_URL` | Deve bater com usuário/senha/db acima; host **`db`** (nome do serviço). |
| `JWT_SECRET` | Gere com `openssl rand -hex 32`. |
| `CORS_ORIGIN` | URLs **exatas** do painel no navegador, com `https://`, separadas por vírgula. |

Opcional:

- `ALLOW_SEED=true` **só na primeira subida** para criar admin/usuários demo (depois remova ou use `false`).
- `WEB_PORT=8080` se a porta 80 já estiver em uso (defina no `.env` ou no ambiente ao rodar compose).

## 3. Subir os containers

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- **Migrations** rodam automaticamente na inicialização da API (`prisma migrate deploy`).
- Dados persistentes: volumes Docker `pizzaria_pg_data` (Postgres) e `pizzaria_uploads` (fotos/logo).

Ver logs:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

## 4. Primeiro acesso

1. Abra `http://IP_DA_VPS` (ou o domínio, após DNS).
2. O frontend chama a API em **`/api`** no mesmo host (sem CORS cross-domain).
3. Se usou seed: faça login com o admin padrão do projeto e **troque a senha** imediatamente.
4. Em **Cadastros**, configure nome, logo e **taxa de entrega** se usar delivery.

### Seed em produção

Com `ALLOW_SEED=true`, é possível chamar uma única vez (do host):

```bash
curl -X POST "http://IP_OU_DOMINIO/api/seed"
```

Depois desligue o seed no `.env` e reinicie a API:

```bash
docker compose -f docker-compose.prod.yml up -d api
```

## 5. HTTPS (recomendado)

O stack expõe **HTTP na porta 80**. Para HTTPS:

**Opção A — TLS na própria VPS (Certbot + Nginx no host)**  
Instale Nginx/Caddy **fora** do Docker como reverse proxy na porta 443, apontando para `127.0.0.1:80` (ou `WEB_PORT` escolhido). Emita certificado Let’s Encrypt para o domínio do cliente.

**Opção B — Cloudflare**Proxy laranja + modo TLS “Full” pode simplificar, desde que o origin esteja coerente com `CORS_ORIGIN`.

Atualize **`CORS_ORIGIN`** no `.env` para as URLs **https** exatas e reinicie a API:

```bash
docker compose -f docker-compose.prod.yml up -d api
```

## 6. Atualização de versão

```bash
cd sistema-pizzaria
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Novas migrations do Prisma rodam ao subir o container `api`.

## 7. Backup do banco

Script de exemplo (na raiz do projeto, com stack no ar):

```bash
chmod +x deploy/backup-db.sh
export POSTGRES_USER=postgres POSTGRES_DB=pizzaria
./deploy/backup-db.sh
```

Agende com **cron** (diário, por exemplo). Guarde backups **fora** da VPS.

**Restore** (exemplo, com arquivo `.sql.gz`):

```bash
gunzip -c backups/pizzaria_YYYYMMDD_HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U postgres -d pizzaria
```

(teste o restore em ambiente de homologação antes.)

## 8. Checklist pós go-live

- [ ] Senhas fortes (`POSTGRES_PASSWORD`, `JWT_SECRET`, admin).
- [ ] `CORS_ORIGIN` igual à URL real do painel (https).
- [ ] Firewall: só portas necessárias; **não** publicar Postgres (5432) na internet.
- [ ] Backup automático configurado.
- [ ] `ALLOW_SEED` desligado após uso.
- [ ] Domínio e QR testados no celular (mesma origem do painel em produção).

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| Login falha / CORS | `CORS_ORIGIN` não bate com a URL no navegador (www vs sem www, http vs https). |
|502 no `/api` | Container `api` parado ou erro nas migrations; veja `docker compose ... logs api`. |
| Fotos/logo somem | Volume `pizzaria_uploads` apagado ou não montado; não apague volumes sem backup. |
| QR não abre rota `/mesa/...` | Nginx precisa do `try_files` → `index.html` (já configurado no `frontend/nginx.conf`). |

---

Para desenvolvimento local, continue usando `docker-compose.yml` (só Postgres) + `npm run dev` na API e no frontend.
