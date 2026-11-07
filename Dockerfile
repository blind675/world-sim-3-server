# syntax=docker/dockerfile:1
FROM node:22-alpine

# Set NODE_ENV for Express internal optimizations and reduced error verbosity.
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (omits devDependencies thanks to NODE_ENV=production).
RUN npm ci --omit=dev --strict-ssl=true

# Copy source code
COPY . .

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]
