const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'videoapp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-service',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        original_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT,
        mime_type VARCHAR(100),
        duration FLOAT,
        width INTEGER,
        height INTEGER,
        thumbnail_path TEXT,
        compressed_path TEXT,
        converted_path TEXT,
        status VARCHAR(20) DEFAULT 'processing',
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  console.log('🔐 Auth check - Headers:', req.headers.authorization);
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  console.log('🔐 Extracted token:', token ? `${token.substring(0, 20)}...` : 'No token');

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ JWT verify error:', err.message);
      console.log('🔑 JWT_SECRET being used:', JWT_SECRET ? `${JWT_SECRET.substring(0, 10)}...` : 'undefined');
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    console.log('✅ Token verified for user:', user.userId);
    req.user = user;
    next();
  });
};

// Register endpoint
app.post('/register', [
  body('username').isLength({ min: 3 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('displayName').optional().isLength({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, displayName } = req.body;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name) 
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, display_name, created_at`,
      [username, email, passwordHash, displayName || username]
    );

    const newUser = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`👤 New user registered: ${username}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.display_name,
        createdAt: newUser.created_at
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
app.post('/login', [
  body('username').notEmpty(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find user by username or email
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`🔐 User logged in: ${user.username}`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
app.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Verify token endpoint
app.post('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    valid: true,
    user: req.user
  });
});

// Get user's videos
app.get('/videos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, original_name, file_name, file_size, mime_type, duration, 
              width, height, thumbnail_path, compressed_path, converted_path, 
              status, is_public, created_at, updated_at 
       FROM videos WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json({
      success: true,
      videos: result.rows
    });

  } catch (error) {
    console.error('Videos fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Delete user's video
app.delete('/videos/:id', authenticateToken, async (req, res) => {
  try {
    const videoId = req.params.id;
    
    // ตรวจสอบว่าวิดีโอเป็นของ user นี้
    const checkResult = await pool.query(
      'SELECT file_name, compressed_path FROM videos WHERE id = $1 AND user_id = $2',
      [videoId, req.user.userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Video not found or access denied' 
      });
    }

    // ลบ record จาก database
    await pool.query('DELETE FROM videos WHERE id = $1', [videoId]);

    console.log(`🗑️ Video deleted: ${videoId} by user ${req.user.userId}`);

    res.json({
      success: true,
      message: 'Video deleted successfully'
    });

  } catch (error) {
    console.error('Video delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete video' 
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Auth service running on port ${PORT}`);
  await initDatabase();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Auth service shutting down...');
  await pool.end();
  process.exit(0);
});