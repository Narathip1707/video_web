const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const redis = require('redis');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  useTempFiles: true,
  tempFileDir: '/tmp/',
  createParentPath: true
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'upload-service',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Upload endpoint
app.post('/upload', async (req, res) => {
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

    // Create job for processing
    const job = {
      id: fileId,
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

// Download processed file
app.get('/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('/app/outputs', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Upload Service running on port ${PORT}`);
  console.log(`📊 Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
});