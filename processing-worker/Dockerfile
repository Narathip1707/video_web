FROM node:18-alpine

RUN apk add --no-cache ffmpeg wget

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY worker.js ./

VOLUME ["/app/uploads", "/app/outputs"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "worker.js"]
