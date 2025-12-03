import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../utils/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { hashPin } from '../utils/pinUtils';

const router = express.Router();

// Create new organization (by agent or owner) - UPDATED: agentId is now required
router.post('/', authenticateToken, requireRole(['owner', 'agent']), async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      address,
      mobile,
      email,
      contactPerson,
      designation,
      pin,
      logoUrl,
      color = '#2563eb',
      agentId  // ADDED: Required agent ID
    } = req.body;

    console.log('📦 Received organization data:', {
      name, address, mobile, email, contactPerson, designation, pin, logoUrl, color, agentId
    });

    // Validation with better error messages - ADDED agentId validation
    if (!name) return res.status(400).json({ error: 'Organization name is required' });
    if (!address) return res.status(400).json({ error: 'Address is required' });
    if (!mobile) return res.status(400).json({ error: 'Mobile number is required' });
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!contactPerson) return res.status(400).json({ error: 'Contact person is required' });
    if (!designation) return res.status(400).json({ error: 'Designation is required' });
    if (!pin) return res.status(400).json({ error: 'PIN is required' });
    if (!agentId) return res.status(400).json({ error: 'Agent ID is required' }); // ADDED

    if (pin.length !== 4) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }

    // ADDED: Verify agent exists
    const [agents] = await pool.execute(
      'SELECT id, name FROM agents WHERE id = ? AND status = "active"',
      [agentId]
    );

    if ((agents as any[]).length === 0) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    const agent = (agents as any[])[0];

    // Check if organization name already exists
    const [existingOrgs] = await pool.execute(
      'SELECT id FROM organizations WHERE name = ?',
      [name]
    );

    if ((existingOrgs as any[]).length > 0) {
      return res.status(400).json({ error: 'Organization name already exists' });
    }

    const hashedPin = await hashPin(pin);

    console.log('🔧 Processed data:', {
      hashedPin: hashedPin.substring(0, 20) + '...',
      agentId,
      agentName: agent.name, // ADDED
      userRole: req.user.role
    });

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Create organization - handle null/undefined explicitly
      const [orgResult] = await connection.execute(
        `INSERT INTO organizations (name, address, mobile, email, contact_person, designation, pin_hash, logo_url, color, agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name, 
          address, 
          mobile, 
          email, 
          contactPerson, 
          designation, 
          hashedPin, 
          logoUrl || null, // Convert undefined to null
          color, 
          agentId // CHANGED: Use the provided agentId instead of req.user.id
        ]
      );

      const orgId = (orgResult as any).insertId;
      console.log('✅ Organization created with ID:', orgId, 'by agent:', agent.name); // UPDATED

      // 2. Create admin user for this organization
      const adminPin = await hashPin('1234'); // Default admin PIN
      
      const [adminResult] = await connection.execute(
        `INSERT INTO users (name, mobile, pin_hash, role, organization_id, status)
         VALUES (?, ?, ?, 'admin', ?, 'active')`,
        [contactPerson, mobile, adminPin, orgId]
      );

      const adminId = (adminResult as any).insertId;
      console.log('✅ Admin user created with ID:', adminId);

      await connection.commit();

      res.status(201).json({
        message: 'Organization created successfully',
        organization: {
          id: orgId,
          name,
          mobile,
          email,
          contactPerson,
          designation,
          color,
          agentId: agentId, // ADDED
          agentName: agent.name // ADDED
        },
        admin: {
          id: adminId,
          mobile: mobile,
          defaultPin: '1234' // Tell agent the default PIN
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('❌ Transaction error:', error);
      throw error;
    } finally {
      connection.release();
    }

  } catch (error: any) {
    console.error('🔥 Organization creation error:', error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get organizations (role-based access) - UNCHANGED
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    let query = '';
    let params: any[] = [];

    if (req.user.role === 'owner') {
      // Owner sees all organizations
      query = `
        SELECT o.*, a.name as agent_name 
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        ORDER BY o.created_at DESC
      `;
    } else if (req.user.role === 'agent') {
      // Agent sees only organizations they created
      query = `
        SELECT o.*, a.name as agent_name 
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        WHERE o.agent_id = ? 
        ORDER BY o.created_at DESC
      `;
      params = [req.user.id];
    } else if (req.user.role === 'admin') {
      // Admin sees only their organization
      query = 'SELECT * FROM organizations WHERE id = ?';
      params = [req.user.organization_id];
    } else {
      // Staff cannot see organizations
      return res.status(403).json({ error: 'Access denied' });
    }

    const [organizations] = await pool.execute(query, params);
    res.json({ organizations });

  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get organization by ID - UNCHANGED
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.params.id;

    // Check access permissions
    if (req.user.role === 'admin' && req.user.organization_id !== parseInt(orgId)) {      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'agent') {
      const [agentOrgs] = await pool.execute(
        'SELECT id FROM organizations WHERE id = ? AND agent_id = ?',
        [orgId, req.user.id]
      );
      if ((agentOrgs as any[]).length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const [organizations] = await pool.execute(
      `SELECT o.*, a.name as agent_name 
       FROM organizations o 
       LEFT JOIN agents a ON o.agent_id = a.id 
       WHERE o.id = ?`,
      [orgId]
    );

    const orgArray = organizations as any[];
    if (orgArray.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({ organization: orgArray[0] });

  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;