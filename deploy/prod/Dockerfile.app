# Production image for AvgExpert Gateway (Node.js + webui_dist)
FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web
RUN node scripts/ensure-better-sqlite3.js

FROM node:20-bookworm-slim AS prod
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/webui_dist ./webui_dist
COPY . .

RUN node scripts/ensure-better-sqlite3.js

ENV NODE_ENV=production
ENV SKIP_WEBUI_BUILD=true

EXPOSE 8200

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://127.0.0.1:8200/ready || exit 1

CMD ["npm", "start"]
