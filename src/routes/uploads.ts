import express, { Request, Response } from 'express';
import multer from 'multer';
import ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs';
import { authenticateToken, AuthRequest, JWTUser } from '../middleware/auth';

const router = express.Router();

// Types
interface UploadRequestBody {
  type: 'photo' | 'aadhaar' | 'logo' | 'document';
  userId?: string;
  originalName?: string;
}

// Multer configuration - keeping your existing setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'temp-uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image (JPEG, PNG) and PDF files are allowed!'));
    }
  }
});

// FTP Configuration
const ftpConfig = {
  host: process.env.FTP_HOST || 's3738.bom1.stableserver.net',
  user: process.env.FTP_USER || 'admin@rutvikainfotech.com',
  password: process.env.FTP_PASSWORD || '',
  port: parseInt(process.env.FTP_PORT || '21'),
  secure: process.env.FTP_SECURE === 'true'
};

// Helper function to ensure directory exists on FTP
// Replace the ensureFtpDirectory function:
const ensureFtpDirectory = async (client: ftp.Client, dirPath: string): Promise<void> => {
    try {
      // Go to root
      await client.cd('/');
      
      const parts = dirPath.split('/').filter(p => p);
      
      for (const part of parts) {
        try {
          // Try to change to directory
          await client.cd(part);
        } catch (error) {
          // If directory doesn't exist, create it
          try {
            await client.send('MKD ' + part);
          } catch (mkdirError) {
            // Directory might already exist or other error
            console.log(`Directory ${part} might already exist`);
          }
          try {
            await client.cd(part);
          } catch (cdError) {
            // Try alternative approach
            await client.send('CWD ' + part);
          }
        }
      }
      
      // Return to root
      await client.cd('/');
    } catch (error) {
      console.error('Error ensuring FTP directory:', error);
      throw error;
    }
  };

// Upload endpoint - using typed AuthRequest
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  let tempFilePath: string | null = null;
  const client = new ftp.Client();
  
  try {
    console.log('📤 Starting file upload...');
    console.log('👤 User making upload:', req.user?.id, req.user?.role);
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    const file = req.file;
    tempFilePath = file.path;
    
    // Type the request body
    const body = req.body as UploadRequestBody;
    const { type = 'photo', userId = 'unknown', originalName } = body;
    
    // Use the authenticated user's ID if not specified
    const uploadUserId = userId === 'unknown' ? String(req.user?.id || 'unknown') : userId;
    
    // Generate safe filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const safeOriginalName = originalName ? 
      originalName.replace(/[^a-zA-Z0-9.]/g, '_') : 
      file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    
    const ext = path.extname(safeOriginalName);
    const filename = `${type}_${uploadUserId}_${timestamp}_${random}${ext}`;
    
    // Your specific upload path
    const ftpUploadPath = `/perfectinfosoft.com/app_uploads/${type}/${filename}`;
    const webAccessPath = `/app_uploads/${type}/${filename}`;
    
    console.log('📁 FTP Path:', ftpUploadPath);
    console.log('🌐 Web Path:', webAccessPath);
    
    // Connect to FTP
    console.log('🔗 Connecting to FTP...');
    await client.access(ftpConfig);
    console.log('✅ FTP Connected');
    
    // Create type directory if it doesn't exist
    const typeDir = `/perfectinfosoft.com/app_uploads/${type}`;
    await ensureFtpDirectory(client, typeDir);
    
    // Upload file
    console.log('⬆️ Uploading file...');
    await client.uploadFrom(file.path, ftpUploadPath);
    console.log('✅ File uploaded to FTP');
    
    client.close();
    
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    // Construct full URL
    const baseUrl = process.env.BASE_URL || 'https://perfectinfosoft.com';
    const fullUrl = `${baseUrl}${webAccessPath}`;
    
    console.log('✅ Upload complete. URL:', fullUrl);
    
    res.json({
      success: true,
      url: fullUrl,
      filename: filename,
      path: webAccessPath,
      type: type,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy: req.user?.id,
      message: 'File uploaded successfully'
    });
    
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    // Close FTP connection
    try { client.close(); } catch {}
    
    res.status(500).json({ 
      success: false, 
      error: 'Upload failed',
      details: error.message,
      code: error.code
    });
  }
});

// Test FTP connection endpoint - using typed AuthRequest
router.get('/test-ftp', authenticateToken, async (req: AuthRequest, res: Response) => {
  const client = new ftp.Client();
  
  try {
    console.log('🧪 Testing FTP connection...');
    console.log('👤 User testing FTP:', req.user?.id, req.user?.role);
    
    await client.access(ftpConfig);
    
    // List root directory
    const list = await client.list();
    console.log('📁 Root directory contents:', list.map(item => item.name));
    
    // Try to access your specific directory
    try {
      await client.cd('/perfectinfosoft.com');
      const appUploads = await client.list();
      console.log('📁 perfectinfosoft.com contents:', appUploads.map(item => item.name));
    } catch (cdError) {
      console.log('⚠️ Could not cd to perfectinfosoft.com:', cdError.message);
    }
    
    client.close();
    
    res.json({
      success: true,
      message: 'FTP connection successful',
      rootContents: list.map(item => item.name),
      user: {
        id: req.user?.id,
        role: req.user?.role
      }
    });
    
  } catch (error: any) {
    console.error('❌ FTP test failed:', error);
    client.close();
    res.status(500).json({
      success: false,
      error: 'FTP test failed',
      details: error.message,
      user: {
        id: req.user?.id,
        role: req.user?.role
      }
    });
  }
});

// Get upload configuration - using typed AuthRequest
router.get('/config', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    config: {
      maxFileSize: '5MB',
      allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      uploadTypes: ['photo', 'aadhaar', 'logo', 'document'],
      baseUrl: process.env.BASE_URL || 'https://perfectinfosoft.com',
      uploadPath: '/app_uploads'
    },
    user: {
      id: req.user?.id,
      role: req.user?.role,
      canUpload: ['owner', 'agent', 'admin'].includes(req.user?.role || '')
    }
  });
});

export default router;