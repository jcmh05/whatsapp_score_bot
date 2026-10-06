FROM node:24-bookworm-slim

# Libraries required by Puppeteer's bundled Chrome for Testing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates dumb-init fonts-liberation \
        libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
        libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
        libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
        libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
        libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 \
        libxshmfence1 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    PUPPETEER_CHROME_HEADLESS_SHELL_SKIP_DOWNLOAD=true \
    PUPPETEER_NO_SANDBOX=true \
    PUPPETEER_DUMPIO=true \
    AUTH_STRATEGY=remote

COPY package.json package-lock.json ./
COPY patches/ ./patches/
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
# Build fails if Chrome cannot start; no WhatsApp login or MongoDB is needed.
RUN npm run check:browser

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "scripts/start.js"]
