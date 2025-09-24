# Video Processing Pipeline

A lightweight video processing system using Docker containers with minimal RAM usage.

## 🚀 Features

- **📤 Video Upload**: Simple drag & drop interface
- **🔄 Background Processing**: Queue-based video processing
- **📸 Thumbnail Generation**: Auto-generate video thumbnails
- **📊 Metadata Extraction**: Get video info (duration, resolution, codec)
- **🗜️ Video Compression**: Compress videos to save space
- **💾 Low Memory Usage**: Total RAM usage ~220MB
- **🐳 Docker Ready**: Complete containerization
- **🔄 Real-time Updates**: Live job status monitoring

## 🏗️ Architecture

```
Frontend (Nginx) --> Upload Service (Node.js) --> Redis Queue --> Processing Worker (FFmpeg)
   40MB RAM             50MB RAM                    30MB RAM        100MB RAM
```

## 📁 Project Structure

```
video-processing-pipeline/
├── docker-compose.yml          # Main orchestration
├── frontend/                   # Web interface
│   ├── index.html             # Main UI
│   ├── nginx.conf             # Nginx config
│   └── Dockerfile             # Frontend container
├── upload-service/            # File upload service
│   ├── server.js              # Express server
│   ├── package.json           # Dependencies
│   └── Dockerfile             # Upload service container
├── processing-worker/         # Video processing
│   ├── worker.js              # FFmpeg worker
│   ├── package.json           # Dependencies
│   └── Dockerfile             # Worker container
├── uploads/                   # Uploaded videos
└── outputs/                   # Processed outputs
```

## 🛠️ Services & Ports

| Service | Port | Purpose | RAM Limit |
|---------|------|---------|-----------|
| Frontend | 3001 | Web UI | 40MB |
| Upload Service | 3002 | File uploads | 50MB |
| Processing Worker | 3003 | Video processing | 120MB |
| Redis | 6380 | Job queue | 30MB |

**Total RAM Usage: ~240MB**

## 🚀 Quick Start

1. **Clone and navigate to project**
   ```bash
   cd video-processing-pipeline
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

3. **Open web interface**
   ```
   http://localhost:3001
   ```

4. **Upload a video and watch it process!**

## 📊 API Endpoints

### Upload Service (Port 3002)
- `POST /upload` - Upload video file
- `GET /job/:id` - Get job status
- `GET /jobs` - List all jobs
- `GET /download/:filename` - Download processed file
- `GET /health` - Health check

### Processing Worker (Port 3003)
- `GET /health` - Health check
- `GET /stats` - Worker statistics

## 🔧 Configuration

### Memory Limits
Edit `docker-compose.yml` to adjust memory limits:
```yaml
deploy:
  resources:
    limits:
      memory: 50M  # Adjust as needed
```

### Video Processing Options
Edit `processing-worker/worker.js`:
```javascript
// Compression settings
.videoBitrate('1000k')  // Adjust bitrate
.size('720x?')          // Adjust resolution
```

## 📈 Monitoring

- **Web Dashboard**: Real-time job status at http://localhost:3001
- **Queue Length**: Shows pending jobs
- **Active Jobs**: Currently processing
- **Memory Usage**: Per-service memory consumption

## 🛡️ Security Features

- Non-root container users
- File size limits (100MB max)
- Input validation
- Health checks
- Resource limits

## 🐛 Troubleshooting

### Check service status
```bash
docker-compose ps
```

### View logs
```bash
docker-compose logs -f [service-name]
```

### Restart services
```bash
docker-compose restart
```

### Check disk space
```bash
du -sh uploads/ outputs/
```

## 🎯 Performance Tips

1. **Clear old files regularly**
   ```bash
   # Clean uploads older than 1 day
   find uploads/ -type f -mtime +1 -delete
   ```

2. **Monitor Redis memory**
   ```bash
   docker exec video-redis redis-cli info memory
   ```

3. **Adjust worker concurrency**
   - Currently processes 1 video at a time
   - Increase RAM limits for parallel processing

## 🔄 Scaling

To handle more traffic:

1. **Add more workers**
   ```yaml
   processing-worker:
     scale: 3  # Run 3 worker instances
   ```

2. **Use external Redis**
   - Replace Redis service with external instance
   - Update REDIS_URL in environment

3. **Add load balancer**
   - Use Nginx upstream for multiple upload services

## 📝 Development

### Run in development mode
```bash
# Frontend
cd frontend && python -m http.server 3001

# Upload Service
cd upload-service && npm run dev

# Worker
cd processing-worker && npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - feel free to use for personal or commercial projects!

---

**Enjoy processing your videos! 🎬✨**