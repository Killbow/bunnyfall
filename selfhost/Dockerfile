# BUNNYFALL: one Dockerfile, two images.
#   target "server": the relay and the account service (selfhost/start.mjs)
#   target "web":    Caddy serving the built game and proxying /relay and /accounts, with automatic HTTPS

FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json server/
RUN npm ci --no-audit --no-fund && npm ci --prefix server --no-audit --no-fund
COPY . .

FROM base AS build
# vite directly: the npm "build" script stamps the git commit, and the image has no .git
RUN npx vite build

FROM base AS server
ENV BIND=0.0.0.0 BUNNYFALL_DATA=/data NODE_ENV=production
VOLUME /data
EXPOSE 8787 8788
CMD ["node", "selfhost/start.mjs"]

FROM caddy:2-alpine AS web
COPY selfhost/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
