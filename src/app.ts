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

// Middleware
app.use(cors());
app.use(express.json());
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

// Listen on Railway port
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
