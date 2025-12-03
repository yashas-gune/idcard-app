import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import agentRoutes from './routes/agents';
import organizationRoutes from './routes/organization';
import templateRoutes from './routes/templates';
import idCardRoutes from './routes/idCards';
import uploadRoutes from './routes/upload';

dotenv.config();

const app = express();

// Parse PORT as number
const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// ⚡ Trust Railway proxy
app.set('trust proxy', true);

// 🔥 SIMPLE CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Cloudflare cache control
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  res.header('CF-Cache-Status', 'BYPASS');
  next();
});

// Create temp-uploads directory if it doesn't exist
const tempUploadsDir = path.join(__dirname, 'temp-uploads');
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
  console.log('📁 Created temp-uploads directory:', tempUploadsDir);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve uploaded files from app_uploads directory
app.use('/app_uploads', express.static(path.join(__dirname, '../../public_html/perfectinfosoft.com/app_uploads')));


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/id-cards', idCardRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'ID Card Management API is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for FTP configuration
app.get('/api/upload/config-check', (req: Request, res: Response) => {
  res.json({
    ftpConfig: {
      host: process.env.FTP_HOST ? 'Configured' : 'Missing',
      user: process.env.FTP_USER ? 'Configured' : 'Missing',
      password: process.env.FTP_PASSWORD ? 'Configured' : 'Missing',
      port: process.env.FTP_PORT || '21',
      secure: process.env.FTP_SECURE || 'false'
    },
    uploadPaths: {
      tempDir: tempUploadsDir,
      publicUrl: process.env.BASE_URL || 'https://perfectinfosoft.com',
      uploadPath: '/app_uploads'
    }
  });
});

// Test endpoint for file upload (public for testing)
app.post('/api/upload/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Upload endpoint is working',
    timestamp: new Date().toISOString(),
    config: {
      maxFileSize: '5MB',
      allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      tempDir: tempUploadsDir
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});

