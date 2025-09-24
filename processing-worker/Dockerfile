# Use Node.js Alpine
FROM node:18-alpine

# Install FFmpeg directly from Alpine packages
RUN apk add --no-cache \
    ffmpeg \
    ca-certificates && \
    rm -rf /usr/local/bin/ffmpeg /usr/local/bin/ffprobe || true

# Set working directory
WORKDIR /app

# Create uploads and outputs directories
RUN mkdir -p /app/uploads /app/outputs

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production && npm cache clean --force

# Copy source code
COPY worker.js ./

# Set FFmpeg path explicitly
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "worker.js"]