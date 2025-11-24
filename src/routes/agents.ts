// src/routes/agents.ts
import express from 'express';
import { authenticateToken } from '../middleware/auth';
import pool from '../utils/database';
import { hashPin } from '../utils/pinUtils';

const router = express.Router();

// Types for MySQL results
interface AgentRow {
  id: number;
  name: string;
  mobile: string;
  email: string;
  working_area: string;
  status: string;
  created_at: string;
}

interface OkPacket {
  insertId: number;
  affectedRows: number;
}

// GET all agents
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [agents] = await pool.execute(`
      SELECT id, name, mobile, email, working_area, status, created_at 
      FROM agents 
      WHERE status = 'active'
    `);
    res.json({ agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create new agent
router.post('/register-agent', authenticateToken, async (req, res) => {
  try {
    console.log('🔵 Received agent registration:', req.body);
    
    const { name, address, aadhaarNo, mobile, email, pin, workingArea } = req.body;

    // Validate required fields
    if (!name || !address || !aadhaarNo || !mobile || !email || !pin || !workingArea) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required' 
      });
    }

    // Check if mobile already exists - PROPERLY TYPED
    const [existingMobileRows] = await pool.execute(
      'SELECT id FROM agents WHERE mobile = ?', 
      [mobile]
    ) as [any[], any];
    
    if (existingMobileRows.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Mobile number already exists' 
      });
    }

    // Check if Aadhaar already exists - PROPERLY TYPED
    const [existingAadhaarRows] = await pool.execute(
      'SELECT id FROM agents WHERE aadhaar_no = ?', 
      [aadhaarNo]
    ) as [any[], any];
    
    if (existingAadhaarRows.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Aadhaar number already exists' 
      });
    }

    // Hash the PIN
    const pinHash = await hashPin(pin);

    // Insert into AGENTS table - PROPERLY TYPED
    const [result] = await pool.execute(
      `INSERT INTO agents 
       (name, address, aadhaar_no, mobile, email, pin_hash, working_area, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [name, address, aadhaarNo, mobile, email, pinHash, workingArea]
    ) as [OkPacket, any];

    console.log('🟢 Agent created successfully with ID:', result.insertId);
    
    res.json({
      success: true,
      message: 'Agent registered successfully',
      agentId: result.insertId
    });

  } catch (error: any) {
    console.error('🔴 Backend error in agent registration:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error: ' + error.message 
    });
  }
});

export default router;