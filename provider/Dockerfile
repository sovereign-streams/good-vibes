FROM node:20-alpine AS base
WORKDIR /app

# ── Dependencies stage ──────────────────────────────────────────
FROM base AS deps

# Copy the enrichment package.json for its dependencies (better-sqlite3)
COPY enrichment/package.json enrichment/package-lock.json* enrichment/
RUN cd enrichment && npm ci --omit=dev

# Copy provider package.json (no prod deps currently, but future-proof)
COPY provider/package.json provider/package-lock.json* provider/
RUN cd provider && npm ci --omit=dev 2>/dev/null || true

# ── Build stage (copy source) ──────────────────────────────────
FROM base AS build

COPY --from=deps /app/enrichment/node_modules enrichment/node_modules
COPY --from=deps /app/provider/node_modules provider/node_modules

# Copy source code
COPY spec/ spec/
COPY enrichment/src/ enrichment/src/
COPY enrichment/package.json enrichment/
COPY provider/src/ provider/src/
COPY provider/package.json provider/

# ── Runtime stage ───────────────────────────────────────────────
FROM base AS runtime

RUN addgroup -g 1001 -S goodvibes && \
    adduser -S goodvibes -u 1001 -G goodvibes

COPY --from=build --chown=goodvibes:goodvibes /app /app

# Data directory for SQLite and telemetry logs
RUN mkdir -p /app/data && chown goodvibes:goodvibes /app/data
VOLUME ["/app/data"]

USER goodvibes

ENV NODE_ENV=production
ENV PORT=3700
ENV DB_PATH=/app/data/good-vibes.db
ENV TELEMETRY_LOG=/app/data/telemetry.jsonl

EXPOSE 3700

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3700/sep/manifest || exit 1

CMD ["node", "provider/src/server.mjs"]
