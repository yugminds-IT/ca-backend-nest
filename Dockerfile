# ==========================================
# 1. Builder Stage
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build NestJS distribution
RUN npm run build

# ==========================================
# 2. Production Runner Stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled application from builder stage
COPY --from=builder /app/dist ./dist

# Run as non-root node user for container security
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
