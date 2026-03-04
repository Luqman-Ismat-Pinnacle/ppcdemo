# PPC Minimal — Azure Container App
# Build context: ppc-minimal/ (use -f ppc-minimal/Dockerfile from repo root, or cd ppc-minimal && docker build .)
ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/javascript-node:20-bookworm
FROM ${BASE_IMAGE} AS base

FROM base AS deps
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache libc6-compat; \
    elif command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y --no-install-recommends libc6 && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env (NEXT_PUBLIC_* embedded in client bundle)
ARG NEXT_PUBLIC_AUTH_DISABLED=false
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG AUTH0_BASE_URL
ARG AUTH0_ISSUER_BASE_URL
ARG DATABASE_URL

ENV NEXT_PUBLIC_AUTH_DISABLED=$NEXT_PUBLIC_AUTH_DISABLED
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV AUTH0_BASE_URL=$AUTH0_BASE_URL
ENV AUTH0_ISSUER_BASE_URL=$AUTH0_ISSUER_BASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
