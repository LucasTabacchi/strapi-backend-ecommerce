# syntax=docker/dockerfile:1

# Strapi v5 (Node 20) - production-ready multi-stage build

FROM node:20-alpine AS deps
WORKDIR /app

# Strapi uses sharp -> needs libvips
RUN apk add --no-cache python3 make g++ vips-dev

COPY package.json package-lock.json ./
RUN npm ci


FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++ vips-dev

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build admin + compile TS (if applicable)
RUN npm run build


FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=1337

# Runtime libvips for sharp
RUN apk add --no-cache vips

# Install only production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built app
COPY --from=build /app ./

EXPOSE 1337

# Optional: basic healthcheck (requires /_health route; Strapi doesn't include by default)
# HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
#   CMD wget -qO- http://127.0.0.1:1337/admin || exit 1

CMD ["npm","run","start"]
