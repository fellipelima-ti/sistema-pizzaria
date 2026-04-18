# Próximos passos sugeridos

Roadmap priorizado após marca, layout e endurecimento básico (CORS + rate limit).

## Curto prazo (maior impacto / esforço médio)

1. **Recuperar / trocar senha** — fluxo por e-mail ou código definido pelo admin. **(entregue em 2026-04-14 via código)**
2. **Editar e desativar usuários** — `PATCH` / `DELETE` em `/users` (admin), UI em Cadastros. **(entregue em 2026-04-14)**
3. **Testes automatizados** — Jest + Supertest no backend (login, pedido, pagamento, QR, usuários, health). **Cobertura ampliada (2026-04-17):** pedidos com **tamanhos** e **meia a meia G** (`backend/tests/order-items-sizes.test.js`). Falta: testes no **frontend** (Vitest/RTL) e mais cenários de API.
4. **CI (GitHub Actions)** — workflow em `.github/workflows/ci.yml`: backend `prisma generate` + `npm test`; frontend `npm run lint` + `npm run build`. **(2026-04-17)**
5. **Backup** — script `deploy/backup-db.sh` (`pg_dump` via Docker) + guias em `MANUAL.md` e `deploy/UBUNTU-DOCKER-CADDY-SITE.md`. **(entregue)**

## Médio prazo

6. **Impressão ESC/POS** — agente local (Node/Electron) ou serviço que receba o ticket e fale com a térmica USB/rede.
7. **WhatsApp real** — fila + webhook ou API oficial (fora do mock).
8. **Auditoria** — log de alterações em pedidos, preços e pagamentos (quem / quando).
9. **Opcionais no cardápio** — bordas, extras e complementos **estruturados** (além de observação livre e dos **tamanhos com preço**, já entregues).

## Longo prazo / produto

10. **Multi-loja (SaaS)** — `tenantId` em todas as tabelas, onboarding e cobrança.
11. **Integração fiscal** — NFC-e / emissor parceiro (escopo contratual separado).
12. **App mobile** — opcional; PWA (manifest / service worker) melhora uso no celular da cozinha.

Atualize este arquivo conforme o que for entregue ao cliente.
