# One container serves the built frontend, the auth/sync API (server/) and
# static assets through Express (backend/). Same image runs locally and on AWS.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json frontend/
COPY backend/package.json backend/package-lock.json backend/
RUN npm ci && npm ci --prefix frontend && npm ci --prefix backend
COPY . .
RUN npm run build --prefix frontend \
 && npm prune --omit=dev && npm prune --omit=dev --prefix backend

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/server server
COPY --from=build --chown=node:node /app/backend/package.json backend/
COPY --from=build --chown=node:node /app/backend/node_modules backend/node_modules
COPY --from=build --chown=node:node /app/backend/src backend/src
COPY --from=build --chown=node:node /app/frontend/dist frontend/dist
# server/sync.js verifies record fingerprints with the shared, dependency-free lib.
COPY --from=build --chown=node:node /app/frontend/src/lib frontend/src/lib
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "backend/src/server.js"]
