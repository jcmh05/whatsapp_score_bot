FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Solo dependencias nativas y protocolo: sin red, cuenta real ni MongoDB.
RUN npm run check:transport

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "scripts/start.js"]
