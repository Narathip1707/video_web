const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const redis = require('redis');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'videoapp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  useTempFiles: true,
  tempFileDir: '/tmp/',
  createParentPath: true
}));

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Simple test endpoint
app.get('/test', (req, res) => {
  console.log('✅ Test endpoint reached!');
  res.json({ message: 'Test successful', timestamp: new Date().toISOString() });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'upload-service',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Upload endpoint (with authentication)
app.post('/upload', authenticateToken, async (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: 'No media file uploaded' });
    }

    const videoFile = req.files.video;
    
    // Check if it's a supported media file
    const supportedTypes = ['video/', 'audio/'];
    const isSupported = supportedTypes.some(type => videoFile.mimetype.startsWith(type));
    
    if (!isSupported) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload video or audio files only.' });
    }

    const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    // Encode filename properly for filesystem compatibility  
    const sanitizedName = Buffer.from(videoFile.name, 'utf8').toString('utf8');
    const fileName = `${fileId}_${sanitizedName}`;
    const uploadPath = path.join('/app/uploads', fileName);

    // Move file to uploads directory
    await videoFile.mv(uploadPath);

    // Save to database
    const result = await pool.query(
      `INSERT INTO videos (user_id, original_name, file_name, file_path, file_size, mime_type, status, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.user.userId, videoFile.name, fileName, uploadPath, videoFile.size, videoFile.mimetype, 'queued', new Date()]
    );

    const videoDbId = result.rows[0].id;

    // Create job for processing
    const job = {
      id: fileId,
      dbId: videoDbId,
      userId: req.user.userId,
      originalName: videoFile.name,
      fileName: fileName,
      filePath: uploadPath,
      fileSize: videoFile.size,
      mimeType: videoFile.mimetype,
      status: 'queued',
      createdAt: new Date().toISOString(),
      isAudio: videoFile.mimetype.startsWith('audio/'),
      tasks: videoFile.mimetype.startsWith('audio/') ? ['metadata', 'convert'] : ['thumbnail', 'metadata', 'compress']
    };

    // Add to Redis queue
    await redisClient.lPush('video_jobs', JSON.stringify(job));
    
    console.log(`📤 File uploaded: ${fileName} (${(videoFile.size / 1024 / 1024).toFixed(2)}MB)`);

    res.json({
      success: true,
      jobId: fileId,
      fileName: fileName,
      message: 'Media file uploaded successfully and queued for processing'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Video streaming endpoint
app.get('/video/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('/app/outputs', filename);
    
    console.log(`🎥 Video request: ${filename}`);
    console.log(`📁 Looking for file at: ${filePath}`);
    console.log(`📂 File exists: ${fs.existsSync(filePath)}`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set basic headers for streaming
    res.set('Content-Type', getContentType(filename));
    res.set('Accept-Ranges', 'bytes');
    res.set('Access-Control-Allow-Origin', '*');
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.set('Content-Length', chunksize);

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.status(200);
      res.set('Content-Length', fileSize);
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Stream failed' });
  }
});

// Get job status
app.get('/job/:id', async (req, res) => {
  try {
    const jobData = await redisClient.get(`job_${req.params.id}`);
    
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(JSON.parse(jobData));
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// List all jobs
app.get('/jobs', async (req, res) => {
  try {
    const keys = await redisClient.keys('job_*');
    const jobs = [];
    
    for (const key of keys) {
      const jobData = await redisClient.get(key);
      if (jobData) {
        jobs.push(JSON.parse(jobData));
      }
    }
    
    // Sort by creation time (newest first)
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(jobs);
  } catch (error) {
    console.error('Jobs list error:', error);
    res.status(500).json({ error: 'Failed to get jobs list' });
  }
});

// Serve processed files (for streaming and download)
app.get('/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('/app/outputs', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Check if it's a download request (has download parameter)
    const isDownload = req.query.download === 'true';

    if (isDownload) {
      // Force download
      res.download(filePath);
      return;
    }

    // For video streaming - completely bypass Express auto headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Content-Type', getContentType(filename));
    res.setHeader('Accept-Ranges', 'bytes');

    // For range requests (partial content)
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      // Send entire file
      res.statusCode = 200;
      res.setHeader('Content-Length', fileSize);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Job status endpoint
app.get('/status/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get job status from Redis
    const jobData = await redisClient.get(`job_${jobId}`);
    
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = JSON.parse(jobData);
    
    res.json({
      jobId: jobId,
      status: job.status,
      progress: job.progress || 0,
      fileName: job.fileName,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check job status' });
  }
});

// Helper function to get content type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Upload Service running on port ${PORT}`);
  console.log(`📊 Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
});