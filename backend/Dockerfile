FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate

COPY src ./src

ENV NODE_ENV=production
ENV PORT=3333
EXPOSE 3333

RUN printf '%s\n' '#!/bin/sh' 'set -e' 'npx prisma migrate deploy' 'exec node src/server.js' > /app/docker-entrypoint.sh \
  && chmod +x /app/docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
