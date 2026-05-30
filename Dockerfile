# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Builder — compiles better-sqlite3 native module and builds the Node server
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

# Build toolchain required for better-sqlite3's native C++ binding
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Pin pnpm via corepack. Version must stay in sync with the lockfile format.
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

WORKDIR /app

# Install dependencies before copying source so this layer is cache-friendly.
# better-sqlite3 is compiled here against Node 22 / glibc (bookworm).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build the adapter-node server.
# static/names.json is committed — no names build step needed.
COPY . .
RUN BRAMBLE_TARGET=node pnpm build:node

# Drop devDependencies so the copied node_modules contains only runtime deps.
# The native better-sqlite3 .node binary remains valid because the runtime
# stage uses the same base image (node:22-bookworm-slim, same glibc/ABI).
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Runtime — minimal image; no build toolchain
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# sqlite3 CLI only — supports the documented backup procedure.
# No build toolchain: the native module is copied from builder (same ABI).
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built server, migrations, package manifest, and pruned node_modules.
# We copy node_modules from builder rather than re-running pnpm install here
# because re-installing would require the build toolchain (for better-sqlite3).
# Same base image guarantees Node ABI compatibility for the native .node file.
COPY --from=builder /app/build ./build
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Non-root user owns the app files and the data volume mount point.
RUN groupadd --gid 1001 bramble && \
    useradd --uid 1001 --gid bramble --shell /bin/sh --create-home bramble && \
    mkdir -p /data && \
    chown -R bramble:bramble /app /data

USER bramble

# Migrations run lazily on first request inside getNodeStorage() — no
# separate migrate step is needed, but /app/migrations must be present.
ENV BRAMBLE_TARGET=node \
    BRAMBLE_MIGRATIONS_DIR=/app/migrations \
    BRAMBLE_DB_PATH=/data/bramble.sqlite \
    PORT=3000

EXPOSE 3000

# Persist the SQLite database across container restarts.
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "build/index.js"]
