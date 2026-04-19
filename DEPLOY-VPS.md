# Deploy na VPS do cliente

**Roteiro na ordem (checklist único):** [deploy/FLUXO-VPS-COMPLETO.md](deploy/FLUXO-VPS-COMPLETO.md) — DNS, `.env`, subir stack, P1000, seed, atualizações pelo PC e **onde** rodar cada comando (Windows vs VPS).

Na VPS, após clonar/copiar o projeto: `chmod +x deploy/vps-compose.sh` e `./deploy/vps-compose.sh` (equivale a `docker compose -f docker-compose.prod.yml up -d --build`).

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

### Se aparecer Prisma **P1000** (autenticação no Postgres)

1. **Mesma senha em dois lugares** — o trecho depois de `postgres:` na URL tem que ser **idêntico** a `POSTGRES_PASSWORD`:

```env
POSTGRES_USER=postgres
POSTGRES_DB=pizzaria
POSTGRES_PASSWORD=MinhaSenhaSegura123

DATABASE_URL=postgresql://postgres:MinhaSenhaSegura123@db:5432/pizzaria?schema=public
```

2. **`#` e `$` no arquivo `.env`** — No formato lido pelo Docker Compose, **`#` inicia comentário** até o fim da linha. Se a senha ou a URL tiver `#`, a linha é **cortada** e a `DATABASE_URL` fica errada → **P1000**. O `$` pode ser interpretado como variável. **Solução mais segura:** use senha **só letras e números** (sem `#`, sem `$`, sem espaço). Se precisar de símbolos, coloque o valor inteiro entre **aspas duplas**, por exemplo: `DATABASE_URL="postgresql://postgres:senha#com#hash@db:5432/pizzaria?schema=public"` e `POSTGRES_PASSWORD="senha#com#hash"`.

3. **Senha com outros símbolos na URL** — `@ : / %` na parte da senha dentro da URL precisam de [URL encoding](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding), ou use senha alfanumérica.

4. **Conferir a URL** (na pasta do projeto, na VPS):

- Se o `api` estiver **rodando**: `docker compose -f docker-compose.prod.yml exec api printenv DATABASE_URL`
- Se o `api` ficar **reiniciando** (Prisma falha antes de estabilizar), o `exec` não funciona. Use um destes:
  - O que está no disco (sem subir o servidor da API):  
    `docker compose -f docker-compose.prod.yml run --rm --no-deps api printenv DATABASE_URL`
  - Ou no host: `grep '^DATABASE_URL=' .env` (cuidado: não cole a senha em chat público).

Tem que mostrar `...@db:5432/pizzaria...` (host **`db`**, não `localhost`).

5. **Volume já criado com outra senha** — se você mudou `POSTGRES_PASSWORD` depois da primeira subida, o arquivo de dados **não** muda sozinho. Ou restaura a senha antiga no `.env`, ou (só se puder **apagar o banco**) remove o volume `pizzaria_pg_data` e sobe de novo — veja a linha da tabela em **Problemas comuns**.

## 3. Subir os containers

```bash
chmod +x deploy/vps-compose.sh
./deploy/vps-compose.sh
```

(Equivale a `docker compose -f docker-compose.prod.yml up -d --build`.)

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

Com `ALLOW_SEED=true` no `.env` (aceita `true`, `True`, `1`, `yes`), reinicie a API (`docker compose ... up -d api`) e chame **uma vez**:

```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST "https://IP_OU_DOMINIO/api/seed"
```

A resposta deve ser **JSON** com `Seed concluido` (HTTP **200**). Se vier **403**, a API ainda não vê `ALLOW_SEED` ligado — confira o `.env` e recrie o container `api`. Se vier **500**, o corpo JSON traz a mensagem de erro (migrations / banco). Confira usuários: `docker compose ... exec -T db psql -U postgres -d pizzaria -c 'SELECT email FROM "User";'`.

Depois desligue o seed no `.env` e reinicie a API:

```bash
docker compose -f docker-compose.prod.yml up -d api
```

## 5. HTTPS (recomendado)

O `docker-compose.prod.yml` de produção já inclui o **Caddy** na VPS (portas **80** e **443**), com certificado automático para o valor de **`DOMAIN`** no `.env`. Antes do HTTPS funcionar no navegador, o domínio precisa **resolver para o IP da VPS**.

### DNS na Hostinger (primeiros passos)

1. **Anote o IP público da VPS** (painel do provedor da VPS ou, na própria VPS: `curl -4 ifconfig.me`).
2. Acesse o [hPanel Hostinger](https://hpanel.hostinger.com/) → **Domínios** → clique em **paraisodapizza.shop** (ou seu domínio) → **DNS / Zona DNS** (às vezes aparece como **Gerenciar** → **DNS**).
3. Na tabela de registros, localize um registro tipo **A** com nome **`@`** (ou vazio, ou o próprio domínio na coluna “Nome”).
4. **Edite** esse registro **A** e troque o IP de destino (ex.: `2.57.91.91`) pelo **IP da sua VPS**. Salve.
5. Se existir registro **A** para **`www`**, aponte também para o **mesmo IP** da VPS (ou use **CNAME** `www` → `@`, se o painel oferecer e você preferir).
6. Evite deixar **dois** registros **A** para `@` com IPs diferentes; deixe só o da VPS.
7. Aguarde **propagação** (costuma levar de minutos a poucas horas). Confira no terminal:

```bash
dig +short paraisodapizza.shop A
```

O resultado deve ser o **IP da VPS**. Só então `https://paraisodapizza.shop/...` deixa de mostrar a página “parked” e passa a bater no Caddy.

8. No `.env` na VPS, confira `DOMAIN=paraisodapizza.shop` e `CORS_ORIGIN=https://paraisodapizza.shop` (adicione `,https://www.paraisodapizza.shop` se for usar **www**). Depois:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate caddy api
```

---

O stack expõe **HTTP na porta 80** e **HTTPS na 443** pelo Caddy no próprio compose.

**Outra opção — TLS na frente (Cloudflare)**  
Se o DNS for gerenciado na Cloudflare (proxy laranja), use modo TLS **Full** e mantenha `CORS_ORIGIN` igual à URL real do navegador.

**Outra opção — TLS só no host (sem Caddy no compose)**  
Menos comum neste projeto: Nginx/Caddy **fora** do Docker na porta 443 apontando para a porta interna do stack.

Se você mudar só **`CORS_ORIGIN`** no `.env` depois (sem mexer em `DOMAIN`), reinicie a API: `docker compose -f docker-compose.prod.yml up -d api`.

## 6. Atualização de versão

Na VPS, na pasta do projeto (onde está `docker-compose.prod.yml`), depois de **trazer o código novo**:

```bash
cd sistema-pizzaria
docker compose -f docker-compose.prod.yml up -d --build
```

O `--build` recompila as imagens `api` e `web` com o que está no disco (inclui o frontend com `VITE_API_URL=/api`). Novas migrations do Prisma rodam ao subir o container `api`.

### Com Git na VPS

```bash
cd sistema-pizzaria
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Do PC direto para a VPS (sem Git)

Na produção o Docker **compila** API e frontend dentro da imagem: na VPS **não** precisa existir `node_modules` no disco. Copie só o código (é mais rápido se você **não** enviar pastas `node_modules`).

**Não envie / não sobrescreva o `.env` da VPS** com o do PC (senhas e `DOMAIN` ficam só no servidor), a menos que queira atualizar de propósito.

#### Opção A — WinSCP ou FileZilla (mais simples no Windows)

1. Instale [WinSCP](https://winscp.net/) ou FileZilla.
2. Nova sessão: protocolo **SFTP**, host = IP ou domínio da VPS, usuário e senha (ou chave SSH).
3. Navegue até a pasta do projeto na VPS (ex.: `/home/usuario/sistema-pizzaria`).
4. Arraste do PC para a VPS: `frontend`, `backend`, `deploy`, arquivos na raiz (`docker-compose.prod.yml`, `.dockerignore`, etc.).
5. No WinSCP: em **Preferências → Transferência → Excluir máscaras**, você pode ignorar `*/node_modules/*` e `*/.git/*` para acelerar.
6. Na VPS (SSH): `docker compose -f docker-compose.prod.yml up -d --build`.

#### Opção B — `scp` no PowerShell (Windows 10/11 com cliente OpenSSH)

No PowerShell, **a partir da pasta que contém** `sistema-pizzaria` (ex.: `Desktop`). Troque `usuario`, `IP` e o caminho remoto:

```powershell
cd $HOME\Desktop
scp -r .\sistema-pizzaria usuario@IP:/home/usuario/
```

Se existir `node_modules` dentro do projeto, a cópia fica pesada; apague no PC (`frontend\node_modules`, `backend\node_modules`) antes do `scp`, ou use a opção A com exclusões.

**Frontend (`frontend/src`, etc.):** o site que o navegador carrega vem do **`npm run build` dentro da imagem Docker `web`**, não do arquivo no disco em tempo real. Depois de copiar só arquivos do front, na VPS é **obrigatório** rodar `docker compose -f docker-compose.prod.yml build web` e `up -d web` (ou `up -d --build`). Sem isso, o login e outras mudanças **não aparecem**, mesmo com o `scp` certo.

#### Opção C — `rsync` (Linux, macOS ou WSL no Windows)

```bash
cd ~/Desktop
rsync -avz --delete \
  --exclude node_modules --exclude .git \
  ./sistema-pizzaria/ usuario@IP:/home/usuario/sistema-pizzaria/
```

Depois de qualquer opção, na VPS:

```bash
cd ~/sistema-pizzaria
docker compose -f docker-compose.prod.yml up -d --build
```

O volume `pizzaria_uploads` (fotos/logo) não some só por copiar código novo; uploads ficam no volume Docker.

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
- [ ] **DNS:** registro **A** de `@` (e de `www`, se usar) aponta para o **IP público da VPS** onde roda o Caddy; o domínio não pode ficar em “parking” ou em outro host.

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| Página **Hostinger** (“Parked domain”, marketing, etc.) ao abrir `https://seudominio/...` | O domínio **não resolve para a sua VPS**: DNS ainda em estacionamento na Hostinger ou registro **A** errado/outro servidor. No painel DNS (Hostinger ou onde o domínio estiver), aponte `@` e `www` para o **IP da VPS**; aguarde propagação (minutos a horas). Confira com `dig +short seudominio A` (deve retornar o IP da VPS). Enquanto isso, teste pelo IP na porta 80 se o firewall liberar: `curl -sS http://IP_DA_VPS/api/health`. |
| `curl: (35) ... tlsv1 alert internal error` no HTTPS | Conexão na 443 ok, mas o **TLS falha** (certificado Let’s Encrypt não emitido ou estado ruim no volume do Caddy). Veja `docker compose ... logs caddy`. Garanta `DOMAIN` / `CADDY_EMAIL` no `.env`, **portas 80 e 443** liberadas e Caddyfile com `email {$CADDY_EMAIL}` (não `{env....}`). Envie o `Caddyfile` atualizado para a VPS, `docker compose ... up -d --force-recreate caddy`. Se persistir: `docker compose ... down`, `docker volume rm ..._caddy_data` (só dados TLS do Caddy), `up -d` de novo. |
| Prisma **P1000** / credenciais inválidas | `DATABASE_URL` não bate com `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`, ou a senha na URL tem caracteres especiais sem **URL-encode** (`@` → `%40`, `#` → `%23`, etc.). Outro caso: você mudou `POSTGRES_PASSWORD` no `.env` **depois** da primeira subida — o volume `pizzaria_pg_data` já foi criado com a senha antiga; ou alinha a senha no `.env` com a que o cluster usa, ou apaga o volume (apaga o banco) e sobe de novo. |
| Login falha / CORS | `CORS_ORIGIN` não bate com a URL no navegador (www vs sem www, http vs https). |
|502 no `/api` | Container `api` parado ou erro nas migrations; veja `docker compose ... logs api`. |
| Fotos/logo somem | Volume `pizzaria_uploads` apagado ou não montado; não apague volumes sem backup. |
| QR não abre rota `/mesa/...` | Nginx precisa do `try_files` → `index.html` (já configurado no `frontend/nginx.conf`). |

---

Para desenvolvimento local, continue usando `docker-compose.yml` (só Postgres) + `npm run dev` na API e no frontend.
