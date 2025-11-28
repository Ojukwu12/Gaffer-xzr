# Polyscope API Dockerfile
# Production-ready Node.js container

FROM node:20-alpine AS base

# Install dependencies for production
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Production stage
FROM base AS runner
WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 polyscope

# Copy dependencies from deps stage
COPY --from=deps --chown=polyscope:nodejs /app/node_modules ./node_modules

# Copy source code
COPY --chown=polyscope:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown polyscope:nodejs logs

# Switch to non-root user
USER polyscope

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
