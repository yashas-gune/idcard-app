import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import agentRoutes from './routes/agents';
import organizationRoutes from './routes/organization';
import templateRoutes from './routes/templates';
import idCardRoutes from './routes/idCards';
import uploadRoutes from './routes/upload';

dotenv.config();

const app = express();

// ⚡ Trust Railway proxy for HTTPS
app.set('trust proxy', true);

// 🔥 CRITICAL: CLOUDFLARE + RAILWAY OPTIMIZED CORS
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow all origins in development, specific in production
    const allowedOrigins = [
      'http://localhost:8081',
      'http://localhost:19006',
      'http://localhost:3000',
      'exp://',
      'https://perfectinfosoft.com',
    ];
    
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    if (process.env.NODE_ENV === 'development' || allowedOrigins.some(o => origin.includes(o))) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-Auth-Token',
    'Access-Control-Allow-Origin',
    'Access-Control-Request-Headers',
    'Access-Control-Request-Method'
  ],
  exposedHeaders: [
    'Content-Length',
    'Authorization',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials'
  ],
  credentials: true,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// 🔥 CLOUDFLARE CACHE CONTROL HEADERS (Prevent Cloudflare from caching API)
app.use((req, res, next) => {
  // Prevent Cloudflare from caching API responses
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  res.header('Surrogate-Control', 'no-store');
  
  // Cloudflare-specific headers
  res.header('CF-Cache-Status', 'BYPASS');
  res.header('CDN-Cache-Control', 'no-cache, no-store');
  
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  next();
});

// 🔥 Handle preflight OPTIONS requests explicitly
app.options('*', (req, res) => {
  // Set CORS headers for preflight
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, X-Auth-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  return res.status(204).end();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 🔥 DEBUG MIDDLEWARE (Remove in production)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/id-cards', idCardRoutes);
app.use('/api/upload', uploadRoutes);

// Health check with CORS test
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ID Card Management API is running',
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin || 'none',
      allowed: true
    }
  });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS test successful',
    yourOrigin: req.headers.origin || 'No origin header',
    serverTime: new Date().toISOString(),
    headers: {
      'access-control-allow-origin': res.getHeader('access-control-allow-origin'),
      'cache-control': res.getHeader('cache-control')
    }
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'ID Card Management API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      agents: '/api/agents',
      organizations: '/api/organizations',
      templates: '/api/templates',
      idCards: '/api/id-cards',
      upload: '/api/upload',
      health: '/api/health',
      corsTest: '/api/cors-test'
    }
  });
});

// Catch-all route for API 404
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🚨 Global error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  });
});

// Listen on Railway port
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 CORS enabled`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Direct Railway URL: ${process.env.RAILWAY_STATIC_URL || 'Not set'}`);
});