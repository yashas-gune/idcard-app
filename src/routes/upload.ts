// src/routes/upload.ts
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Check file type
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Upload single file
router.post('/single', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    // Construct the URL for the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    
    console.log('📁 File uploaded successfully:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl
    });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'File upload failed' 
    });
  }
});

// Upload photo specifically
router.post('/photo', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No photo uploaded' 
      });
    }

    // Validate it's an image
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ 
        success: false,
        error: 'Only image files are allowed' 
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    console.log('📸 Photo uploaded for ID card:', {
      filename: req.file.filename,
      size: req.file.size,
      uploadedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        url: fileUrl,
        filename: req.file.filename
      }
    });

  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Photo upload failed' 
    });
  }
});

export default router;