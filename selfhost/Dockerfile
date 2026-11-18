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
# vite directly: the npm "build" script runs git, and the image has no .git. The build tag is the commit update.sh
# passes, or the build time when none is passed, so the game's update check sees each new build.
ARG BUNNYFALL_BUILD_TAG
RUN BUNNYFALL_BUILD_TAG="${BUNNYFALL_BUILD_TAG:-bf$(date -u +%Y%m%d%H%M%S)}" node scripts/buildTag.mjs && npx vite build
# the World Builder (tools/poi-editor/) is its own app, served at /builder/ next to the game
RUN npx vite build --config tools/poi-editor/vite.config.js

FROM base AS server
RUN npm ci --prefix discord-bot --omit=dev --no-audit --no-fund
ENV BIND=0.0.0.0 BUNNYFALL_DATA=/data BUNNYFALL_UPDATES=/updates NODE_ENV=production
VOLUME /data
EXPOSE 8787 8788 8789
CMD ["node", "selfhost/start.mjs"]

FROM caddy:2-alpine AS web
COPY selfhost/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY --from=build /app/dist-poi-editor /srv/builder
