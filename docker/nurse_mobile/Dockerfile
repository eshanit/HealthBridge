# =============================================================================
# UtanoBridge Nurse Mobile - Nuxt.js Frontend Dockerfile
# Production-ready multi-stage build for Nuxt 4 application
# =============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY nurse_mobile/package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --include=dev

# =============================================================================
# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY nurse_mobile/ .

# Set build-time environment variables
ARG NUXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NUXT_PUBLIC_AI_ENABLED=false
ARG NUXT_PUBLIC_AI_ENDPOINT=http://ollama:11434
ARG NUXT_PUBLIC_AI_MODEL=gemma3:4b
ARG OLLAMA_URL=http://ollama:11434
ARG OLLAMA_MODEL=gemma3:4b
ARG AI_RATE_LIMIT=30
ARG AI_TIMEOUT=60000

ENV NUXT_PUBLIC_API_BASE_URL=${NUXT_PUBLIC_API_BASE_URL}
ENV NUXT_PUBLIC_AI_ENABLED=${NUXT_PUBLIC_AI_ENABLED}
ENV NUXT_PUBLIC_AI_ENDPOINT=${NUXT_PUBLIC_AI_ENDPOINT}
ENV NUXT_PUBLIC_AI_MODEL=${NUXT_PUBLIC_AI_MODEL}
ENV OLLAMA_URL=${OLLAMA_URL}
ENV OLLAMA_MODEL=${OLLAMA_MODEL}
ENV AI_RATE_LIMIT=${AI_RATE_LIMIT}
ENV AI_TIMEOUT=${AI_TIMEOUT}
ENV NODE_ENV=production

# Build the Nuxt application
RUN npm run build

# =============================================================================
# Stage 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nuxt

# Set production environment
ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

# Copy built application from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

# Set proper ownership
RUN chown -R nuxt:nodejs /app

# Switch to non-root user
USER nuxt

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the Nuxt server
CMD ["node", ".output/server/index.mjs"]
