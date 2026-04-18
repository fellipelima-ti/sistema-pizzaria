# Manual rápido — Sistema Pizzaria

Guia operacional para dono da loja e equipe. Detalhes técnicos: `README.md` e `deploy/HOSTGATOR-VPS.md`.

## 1. Primeiro acesso (administrador)

1. Suba a API e o banco (ou use o deploy na nuvem).
2. Rode o **seed** uma vez em ambiente controlado (`POST /seed` ou conforme README) para criar usuário e dados de exemplo.
3. Entre no painel com o e-mail e senha do administrador.
4. **Troque a senha padrão** assim que possível. Há fluxo de **recuperação por código** no login (admin define código de recuperação no cadastro do usuário, quando disponível).

## 2. Turno de caixa (dono — perfil Administrador)

- Abra a aba **Financeiro**.
- **Abrir turno**: informe troco inicial se quiser; sem turno aberto, **ninguém registra pedido pelo balcão** nem recebe pagamentos pelo sistema.
- **Fechar turno**: ao fim do dia; o sistema guarda resumo do período.
- **Contas em aberto** e **pagamentos** (dinheiro, Pix, cartão) ficam nesta área ou na aba **Pedidos** (botões de pagamento — só o administrador).

## 3. Atendimento (perfil Atendimento / `caixa`)

- **Mesas**: mapa, QR para o cliente pedir pelo celular, link da mesa.
- **Novo pedido**: cliente, tipo (balcão, mesa, etc.), itens; **pagamento na hora** só o administrador marca.
- **Pedidos**: lista geral; **Imprimir** abre janela para impressora térmica ou PDF (navegador).
- Se aparecer “turno fechado”, o administrador precisa abrir o turno em **Financeiro**.

## 4. Cozinha

- Aba **Cozinha**: fila de pedidos, avançar status, imprimir comprovante.
- Pedidos vindos do **QR da mesa** aparecem como os demais.

## 5. Garçom

- **Mesas** e **Novo pedido** / **Pedidos** no salão; mesmo cuidado com turno aberto para novos pedidos.

## 6. Cardápio e cadastros (administrador)

- **Cardápio**: produtos, preços, foto, disponível/indisponível (afeta QR e novo pedido).
- **Tamanhos (ex.: pizza P, M, G)**: em cada item do cardápio você pode cadastrar vários tamanhos com preço próprio. O preço “base” do produto vira o **menor** entre os tamanhos (referência na lista).
- **Meia a meia na grande**: se existir tamanho **G**, **Grande** ou **GG** (rótulo exatamente assim, ignorando maiúsculas), o pedido **exige dois sabores** — o primeiro e o que o cliente escolhe como **2º sabor** no carrinho (painel **Novo pedido** ou página do **QR da mesa**). O valor da linha é o **maior** preço daquele tamanho entre os dois sabores. Tamanhos **P** e **M** (e demais) são **um sabor só**; não envie segundo sabor.
- **Cadastros**: **Marca do estabelecimento** (nome + logo no login, menu e página do QR), clientes, mesas, **usuários do painel** (perfis: administrador, atendimento, cozinha, garçom).

## 7. QR do cliente na nuvem

- O cliente acessa `https://seu-site/mesa/TOKEN`.
- Configure `VITE_PUBLIC_ORIGIN` e `VITE_API_URL` no build do front; no servidor, HTTPS e fallback SPA para `/mesa/*`.  
- Leia: `deploy/QR-E-NUVEM.md`.

## 8. Produção — segurança mínima

- Defina **`JWT_SECRET`** longo e aleatório.
- Defina **`CORS_ORIGIN`** com a(s) URL(s) exata(s) do site do painel (obrigatório com `NODE_ENV=production`).
- Desative seed em produção (`ALLOW_SEED` não definido ou `false`).
- Faça **backup periódico** do PostgreSQL (veja seção 10 abaixo).

## 9. Suporte técnico

- API saudável: `GET /health` (JSON com `status`, `database` e `checkedAt`). Se o banco estiver fora, a API responde **503** e `database: down` — útil para monitoramento externo.
- Problemas comuns: CORS (origem não listada), turno fechado, QR 404 (servidor sem fallback SPA).

## 10. Backup do banco (produção com Docker)

Na VPS, com o stack no ar (`docker compose -f docker-compose.prod.yml up -d`):

1. Torne o script executável (uma vez): `chmod +x deploy/backup-db.sh`
2. Rode na **raiz** do projeto: `./deploy/backup-db.sh`

Será criada a pasta `backups/` com arquivo `pizzaria-db-AAAAMMDD-HHMMSS.sql.gz`. Arquivos com mais de **14 dias** na mesma pasta são removidos automaticamente (ajuste com `RETENTION_DAYS=30 ./deploy/backup-db.sh` se quiser).

**Agendar (exemplo, todo dia às 3h):** `crontab -e` e uma linha:

```cron
0 3 * * * cd /opt/sistema-pizzaria && ./deploy/backup-db.sh >>/var/log/pizzaria-backup.log 2>&1
```

(Ajuste o caminho `cd` para onde o projeto está na sua VPS.)

**Restaurar** (com o stack parado ou em outro Postgres vazio): descompacte e importe com `psql` — peça ao suporte técnico ou administrador do banco; em Docker, algo como:

```bash
gunzip -c backups/pizzaria-db-YYYYMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d pizzaria
```
