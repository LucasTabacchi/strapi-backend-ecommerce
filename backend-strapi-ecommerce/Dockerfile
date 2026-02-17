# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Build deps (por si hay módulos nativos)
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=1337

# Copiamos el app ya builded (incluye node_modules del build stage)
COPY --from=build /app ./

# Mucho más rápido que reinstalar: elimina devDependencies
RUN npm prune --omit=dev && npm cache clean --force

EXPOSE 1337
CMD ["npm","run","start"]
