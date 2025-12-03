import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../utils/database';
import { verifyPin, hashPin } from '../utils/pinUtils';

const router = express.Router();

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { mobile, pin } = req.body;

    if (!mobile || !pin) {
      return res.status(400).json({ error: 'Mobile and PIN are required' });
    }

    console.log('🔐 Login attempt for mobile:', mobile);

    // Find user by mobile
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE mobile = ? AND status = "active"',
      [mobile]
    );

    const userArray = users as any[];

    if (userArray.length === 0) {
      console.log('❌ User not found:', mobile);
      return res.status(401).json({ error: 'Invalid mobile or PIN' });
    }

    const user = userArray[0];
    console.log('👤 User found:', user.name, 'Role:', user.role);

    // Verify PIN using our utility
    const isValidPin = await verifyPin(pin, user.pin_hash);
    
    if (!isValidPin) {
      console.log('❌ Invalid PIN for user:', user.name);
      return res.status(401).json({ error: 'Invalid mobile or PIN' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        mobile: user.mobile, 
        role: user.role,
        organization_id: user.organization_id,
        department: user.department || 'General'
      },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );
    
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        organization_id: user.organization_id,
        department: user.department
      }
    });
    

  } catch (error) {
    console.error('🔥 Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;