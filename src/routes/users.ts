import express from 'express';
import pool from '../utils/database'; // Your DB connection
import { authenticateToken, requireRole } from '../middleware/auth';
import { hashPin } from '../utils/pinUtils'; // Assuming you have this helper

const router = express.Router();

// 1. GET ALL USERS (Filtered by Organization)
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { role, organization_id, id } = req.user; // Extracted from JWT Token

    let query = '';
    let params = [];

    // LOGIC: 
    // Owner sees everyone. 
    // Admin sees ONLY their organization's staff.
    // Staff sees only themselves.

    if (role === 'owner') {
      query = `SELECT id, name, mobile, role, department, status, created_at FROM users`;
    } 
    else if (role === 'admin') {
      if (!organization_id) {
        return res.status(400).json({ error: "Admin has no Organization linked!" });
      }
      query = `SELECT id, name, mobile, role, department, status, created_at FROM users WHERE organization_id = ?`;
      params = [organization_id];
    } 
    else {
      query = `SELECT id, name, mobile, role, department, status, created_at FROM users WHERE id = ?`;
      params = [id];
    }

    const [users] = await pool.execute(query, params);
    res.json({ users }); // Send real list back

  } catch (error) {
    console.error('Fetch Users Error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. CREATE STAFF (Auto-Link Organization)
router.post('/register-staff', authenticateToken, requireRole(['admin']), async (req: any, res) => {
  try {
    const { name, mobile, pin, department, email } = req.body;
    
    // CRITICAL: Get Org ID from the logged-in Admin's token
    const organizationId = req.user.organization_id;

    // SAFETY CHECK
    if (!organizationId) {
      return res.status(403).json({ error: "You (Admin) are not linked to an Organization. Cannot create staff." });
    }

    // Check duplicates
    const [existing] = await pool.execute('SELECT id FROM users WHERE mobile = ?', [mobile]);
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ error: 'Mobile already registered' });
    }

    const hashedPin = await hashPin(pin);

    // INSERT into DB
    const [result] = await pool.execute(
      `INSERT INTO users (name, mobile, pin_hash, role, organization_id, department, email, status) 
       VALUES (?, ?, ?, 'staff', ?, ?, ?, 'active')`,
      [name, mobile, hashedPin, organizationId, department, email || null]
    );

    res.status(201).json({
      message: 'Staff created successfully',
      user: { id: (result as any).insertId, name, mobile }
    });

  } catch (error) {
    console.error('Create Staff Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;