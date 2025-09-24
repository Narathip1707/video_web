const express = require('express');
const redis = require('redis');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Set FFmpeg paths explicitly
ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || '/usr/bin/ffmpeg');
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');

// Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Enable CORS for all routes
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001', '*'], // Allow frontend origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'processing-worker',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Get worker stats
app.get('/stats', async (req, res) => {
  try {
    const queueLength = await redisClient.lLen('video_jobs');
    const activeJobs = await redisClient.keys('job_*_processing');
    
    res.json({
      queueLength,
      activeJobs: activeJobs.length,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Processing functions
async function generateThumbnail(inputPath, outputDir, jobId) {
  return new Promise((resolve, reject) => {
    const thumbnailPath = path.join(outputDir, `${jobId}_thumbnail.jpg`);
    
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['10%'],
        filename: `${jobId}_thumbnail.jpg`,
        folder: outputDir,
        size: '320x240'
      })
      .on('end', () => {
        console.log(`📸 Thumbnail created: ${jobId}_thumbnail.jpg`);
        resolve(thumbnailPath);
      })
      .on('error', reject);
  });
}

async function convertAudio(inputPath, outputDir, jobId) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${jobId}_converted.mp3`);
    
    ffmpeg(inputPath)
      .output(outputPath)
      .audioCodec('mp3')
      .audioBitrate('128k')
      .on('start', (cmd) => {
        console.log(`🔄 Converting audio: ${jobId}...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`📊 Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`✅ Audio conversion complete: ${jobId}_converted.mp3`);
        resolve(outputPath);
      })
      .on('error', reject)
      .run();
  });
}

async function extractMetadata(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        
        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          format: metadata.format.format_name,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate) || 0
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            channels: audioStream.channels,
            sample_rate: audioStream.sample_rate
          } : null
        });
      }
    });
  });
}

async function compressVideo(inputPath, outputDir, jobId) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${jobId}_compressed.mp4`);
    
    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .videoBitrate('1000k')
      .audioBitrate('128k')
      .size('720x?')
      .autopad()
      .on('start', (cmd) => {
        console.log(`🔄 Compressing: ${jobId}...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`📊 Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`✅ Compression complete: ${jobId}_compressed.mp4`);
        resolve(outputPath);
      })
      .on('error', reject)
      .run();
  });
}

// Main processing function
async function processVideo(job) {
  const { id, filePath, fileName, isAudio } = job;
  const outputDir = '/app/outputs';
  
  try {
    // Update job status
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    job.progress = 0;
    await redisClient.set(`job_${id}`, JSON.stringify(job));
    await redisClient.set(`job_${id}_processing`, '1', { EX: 3600 }); // Expire in 1 hour
    
    console.log(`🚀 Processing started: ${fileName} (${isAudio ? 'Audio' : 'Video'})`);
    
    // Step 1: Extract metadata
    console.log(`📋 Extracting metadata...`);
    const metadata = await extractMetadata(filePath);
    job.metadata = metadata;
    job.progress = isAudio ? 50 : 33;
    await redisClient.set(`job_${id}`, JSON.stringify(job));
    
    if (isAudio) {
      // For audio files: just convert to MP3
      console.log(`🎵 Converting audio...`);
      const convertedPath = await convertAudio(filePath, outputDir, id);
      job.convertedPath = convertedPath;
      job.progress = 100;
    } else {
      // For video files: generate thumbnail and compress
      // Step 2: Generate thumbnail
      console.log(`📸 Generating thumbnail...`);
      const thumbnailPath = await generateThumbnail(filePath, outputDir, id);
      job.thumbnailPath = thumbnailPath;
      job.progress = 66;
      await redisClient.set(`job_${id}`, JSON.stringify(job));
      
      // Step 3: Compress video
      console.log(`🗜️ Compressing video...`);
      const compressedPath = await compressVideo(filePath, outputDir, id);
      job.compressedPath = compressedPath;
      job.progress = 100;
    }
    
    // Final update
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.processingTime = new Date(job.completedAt) - new Date(job.startedAt);
    
    await redisClient.set(`job_${id}`, JSON.stringify(job));
    await redisClient.del(`job_${id}_processing`);
    
    console.log(`✅ Processing completed: ${fileName} (${job.processingTime}ms)`);
    
  } catch (error) {
    console.error(`❌ Processing failed: ${fileName}`, error.message);
    
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    
    await redisClient.set(`job_${id}`, JSON.stringify(job));
    await redisClient.del(`job_${id}_processing`);
  }
}

// Worker loop
async function workerLoop() {
  console.log('🔄 Worker started, listening for jobs...');
  
  while (true) {
    try {
      // Get job from queue (blocking pop with 5 second timeout)
      const jobData = await redisClient.brPop('video_jobs', 5);
      
      if (jobData) {
        const job = JSON.parse(jobData.element);
        console.log(`📥 Received job: ${job.fileName}`);
        
        // Process the job
        await processVideo(job);
      }
      
      // Small delay to prevent high CPU usage
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Worker error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on error
    }
  }
}

// Start worker
workerLoop();

// Start HTTP server for health checks and stats
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Processing Worker running on port ${PORT}`);
  console.log(`📊 Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
});