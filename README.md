# Video Processing Pipeline

Complete video management system with authentication, upload, processing, and playback capabilities.

## 🚀 Features

- **� Authentication**: JWT-based user login and registration system
- **�📤 Video Upload**: Drag & drop interface with real-time progress tracking
- **🔄 Background Processing**: Queue-based video processing with live status updates
- **📸 Thumbnail Generation**: Automatic video thumbnail creation
- **🎬 Video Playback**: Built-in video player with download options
- **📊 Video Management**: Dashboard with statistics and file management
- **🗜️ Video Compression**: FFmpeg-based video compression and optimization
- **🐳 Docker Ready**: Complete microservices containerization
- **⚡ Real-time Progress**: Live upload and processing progress monitoring

## 🏗️ Architecture

```
                     ┌─────────────────┐
                     │    Frontend     │
                     │   (Nginx)       │
                     │   Port: 3001    │
                     └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │  Auth Service   │ │ Upload Service  │ │ Processing      │
    │   (Node.js)     │ │   (Node.js)     │ │   Worker        │
    │   Port: 3004    │ │   Port: 3002    │ │   (FFmpeg)      │
    └─────────────────┘ └─────────────────┘ │   Port: 3003    │
              │               │             └─────────────────┘
              │               │                       │
    ┌─────────────────┐ ┌─────────────────┐         │
    │   PostgreSQL    │ │     Redis       │─────────┘
    │   Database      │ │     Queue       │
    │   Port: 5434    │ │   Port: 6380    │
    └─────────────────┘ └─────────────────┘
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

| Service | Port | Purpose | Technology |
|---------|------|---------|------------|
| Frontend | 3001 | Web UI & Static Files | Nginx Alpine |
| Upload Service | 3002 | File uploads & Job Queue | Node.js + Express |
| Processing Worker | 3003 | Video processing | Node.js + FFmpeg |
| Auth Service | 3004 | Authentication & User Management | Node.js + JWT |
| PostgreSQL | 5434 | User & Video Database | PostgreSQL 15-alpine |
| Redis | 6380 | Job queue & Session Cache | Redis Alpine |

**Complete microservices architecture with authentication and persistent storage**

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

### Auth Service (Port 3004)
- `POST /login` - User authentication
- `POST /register` - User registration
- `GET /videos` - Get user's videos (JWT required)
- `DELETE /videos/:id` - Delete user's video (JWT required)

### Upload Service (Port 3002)
- `POST /upload` - Upload video file (JWT required)
- `GET /status/:jobId` - Get processing status
- `GET /download/:filename` - Download processed file
- `GET /health` - Health check

### Processing Worker (Port 3003)
- `GET /health` - Health check
- Background job processing via Redis queue

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

## 🛡️ Security Features & Considerations

### Built-in Security
- JWT authentication with 7-day token expiration
- Password hashing with bcrypt
- Non-root container users
- File upload size limits (100MB max)
- Input validation and sanitization
- Health checks for all services
- Container resource limits

### ⚠️ Before Production Deployment

**CRITICAL**: Change these default values before deploying:

1. **Database Security**
   ```bash
   # Change in docker-compose.yml
   POSTGRES_PASSWORD: "your-secure-password-here"
   DB_PASSWORD: "your-secure-password-here"
   ```

2. **JWT Secret**
   ```bash
   # Use a strong random secret (32+ characters)
   JWT_SECRET: "your-super-secure-jwt-secret-key-here"
   ```

3. **Additional Security Measures**
   - Set up SSL/TLS certificates
   - Configure firewall rules
   - Use environment variables for secrets (not docker-compose.yml)
   - Set up regular database backups
   - Monitor file upload directories
   - Configure rate limiting
   - Set up log monitoring

### Files Excluded from Git
The `.gitignore` file excludes:
- `uploads/` and `outputs/` directories
- Environment files (`.env`, `.env.local`)
- Database data and logs
- Node.js modules and dependencies
- Docker volumes and sensitive files

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