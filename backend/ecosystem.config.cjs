/**
 * PM2 na VPS HostGator (ou outro Linux):
 *   cd backend && npm ci && npx prisma migrate deploy && npx prisma generate
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "pizzaria-api",
      script: "src/server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3333,
      },
    },
  ],
};
