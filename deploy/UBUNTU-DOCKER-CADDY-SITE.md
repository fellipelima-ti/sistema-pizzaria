# VPS Ubuntu — Hospedar como Site (1 domínio) com Docker + Caddy

Este guia sobe o sistema como um site único:
- `https://SEU_DOMINIO/` → painel e QR da mesa
- `/api/*` → API por trás (feito via nginx do container `web`)
- `/uploads/*` → imagens (logo e fotos do cardápio) por trás

## 1) Pré-requisitos na VPS

1. Docker e Docker Compose instalados.
2. Um domínio apontando para o IP público da VPS:
   - `A @` → IP da VPS
   - opcional: `A www` → IP da VPS (não é obrigatório no Caddy)
3. Portas `80` e `443` liberadas no firewall/segurança da VPS.

## 2) Preparar variáveis de ambiente

1. Copie e renomeie:
   - `deploy/env.production.example` → `.env`
2. Ajuste no `.env`:
   - `DOMAIN=seu-dominio.com.br`
   - `CADDY_EMAIL=seu-email@dominio.com`
   - `CORS_ORIGIN=https://seu-dominio.com.br`
   - `POSTGRES_PASSWORD`, `DATABASE_URL` e `JWT_SECRET` (segredos)

## 3) Subir o sistema

Na raiz do projeto (`sistema-pizzaria`):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Isso vai:
1. Subir o Postgres
2. Subir o backend e rodar `prisma migrate deploy` na inicialização do container
3. Subir o frontend (build) e servir via nginx
4. Subir o Caddy e liberar HTTPS automaticamente via Let's Encrypt

## 4) Verificar

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy
```

Depois confirme no navegador:
- `https://SEU_DOMINIO/`
- `https://SEU_DOMINIO/health` (endpoint do backend proxyado)

## 5) Primeira configuração de usuários (seed)

Se você quiser que o sistema crie dados iniciais automaticamente:
- deixe `ALLOW_SEED=true` no `.env` na primeira inicialização

Após confirmar que entrou no painel, desative seed:
- `ALLOW_SEED=false`

## 6) Persistência de imagens

O Docker já cria volumes persistentes para:
- uploads (`uploads/products` e `uploads/branding`)
- dados do Postgres
- dados do Caddy (certificados)

## 7) Backup automático do PostgreSQL

1. Na raiz do projeto: `chmod +x deploy/backup-db.sh`
2. Teste: `./deploy/backup-db.sh` — deve aparecer `backups/pizzaria-db-....sql.gz`
3. Agende no `crontab` (veja exemplo em `MANUAL.md` seção 10).

Os backups ficam **fora** do volume nomeado do Postgres; copie a pasta `backups/` periodicamente para outro disco ou nuvem (S3, Drive, etc.) para proteger contra perda da VPS inteira.

## 8) Monitoramento externo

- O endpoint `GET /health` (no seu site: `https://SEU_DOMINIO/health`) confere também a **conexão com o banco**. Resposta **200** + `database: up` = OK; **503** = API no ar mas banco inacessível.
- O serviço `api` no Docker possui **healthcheck**; `docker compose -f docker-compose.prod.yml ps` mostra coluna `STATUS` com `(healthy)` quando tudo certo.
- Cadastre a URL em um serviço de uptime (ex.: UptimeRobot, Better Stack) para receber alerta se o site cair.

