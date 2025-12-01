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

// 🔥 CRITICAL FIX: Enhanced CORS configuration for React Native
app.use(cors({
  origin: '*', // Explicitly allow all origins (for development)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept', 
    'Origin', 
    'X-Requested-With',
    'X-Auth-Token',
    'Access-Control-Allow-Origin'
  ],
  exposedHeaders: ['Content-Length', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle preflight OPTIONS requests for all routes
app.options('*', cors()); // Enable preflight for ALL routes

// OR manually handle preflight (alternative)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add this for form data
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/id-cards', idCardRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ID Card Management API is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'ID Card Management API',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      agents: '/api/agents',
      organizations: '/api/organizations',
      templates: '/api/templates',
      idCards: '/api/id-cards',
      upload: '/api/upload',
      health: '/api/health'
    }
  });
});

// Catch-all route for API 404
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString()
  });
});

// Listen on Railway port
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 CORS enabled for all origins`);
});