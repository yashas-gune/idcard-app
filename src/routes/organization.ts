import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../utils/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { hashPin } from '../utils/pinUtils';

const router = express.Router();

// Create new organization (by agent or owner) - FIXED: Admin uses same PIN as organization
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
      agentId  // Required agent ID
    } = req.body;

    console.log('📦 Received organization data:', {
      name, address, mobile, email, contactPerson, designation, 
      pin: pin ? '****' : 'missing', // Mask PIN in logs
      logoUrl: logoUrl ? 'provided' : 'not provided',
      color, agentId
    });

    // Validation with better error messages
    if (!name) return res.status(400).json({ error: 'Organization name is required' });
    if (!address) return res.status(400).json({ error: 'Address is required' });
    if (!mobile) return res.status(400).json({ error: 'Mobile number is required' });
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!contactPerson) return res.status(400).json({ error: 'Contact person is required' });
    if (!designation) return res.status(400).json({ error: 'Designation is required' });
    if (!pin) return res.status(400).json({ error: 'PIN is required' });
    if (!agentId) return res.status(400).json({ error: 'Agent ID is required' });

    // Validate PIN format
    if (pin.length !== 4) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    
    if (!/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must contain only numbers (0-9)' });
    }

    // Verify agent exists
    const [agents] = await pool.execute(
      'SELECT id, name FROM agents WHERE id = ? AND status = "active"',
      [agentId]
    );

    if ((agents as any[]).length === 0) {
      return res.status(400).json({ error: 'Invalid agent ID or agent is inactive' });
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

    // Check if mobile number is already used (to avoid duplicate admin logins)
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE mobile = ? AND role = "admin"',
      [mobile]
    );

    if ((existingUsers as any[]).length > 0) {
      return res.status(400).json({ 
        error: 'Mobile number already registered as an admin. Please use a different mobile number.' 
      });
    }

    // Hash the PIN once for both organization and admin
    const hashedPin = await hashPin(pin);

    console.log('🔧 Processed data:', {
      hashedPinPrefix: hashedPin.substring(0, 20) + '...',
      agentId,
      agentName: agent.name,
      userRole: req.user.role
    });

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Create organization
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
          hashedPin,  // Organization PIN
          logoUrl || null,
          color, 
          agentId
        ]
      );

      const orgId = (orgResult as any).insertId;
      console.log('✅ Organization created with ID:', orgId, 'by agent:', agent.name);

      // 2. Create admin user for this organization - USING SAME PIN
      // FIXED: Use the same PIN that was entered for the organization
      const [adminResult] = await connection.execute(
        `INSERT INTO users (name, mobile, pin_hash, role, organization_id, status)
         VALUES (?, ?, ?, 'admin', ?, 'active')`,
        [contactPerson, mobile, hashedPin, orgId]  // Same PIN hash!
      );

      const adminId = (adminResult as any).insertId;
      console.log('✅ Admin user created with ID:', adminId);
      console.log('🔑 Admin login: Mobile =', mobile, 'PIN =', pin);

      await connection.commit();

      res.status(201).json({
        success: true,
        message: 'Organization created successfully',
        data: {
          organization: {
            id: orgId,
            name,
            mobile,
            email,
            contactPerson,
            designation,
            color,
            agentId,
            agentName: agent.name
          },
          admin: {
            id: adminId,
            name: contactPerson,
            mobile: mobile,
            pin: pin,  // Return the actual PIN (for frontend display only)
            role: 'admin'
          }
        }
      });

    } catch (error: any) {
      await connection.rollback();
      console.error('❌ Transaction error:', error);
      
      // Handle duplicate mobile number error
      if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage?.includes('mobile')) {
        return res.status(400).json({ 
          error: 'Mobile number already registered. Please use a different mobile number.' 
        });
      }
      
      throw error;
    } finally {
      connection.release();
    }

  } catch (error: any) {
    console.error('🔥 Organization creation error:', error.message);
    
    // Handle specific errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Organization name or mobile number already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get organizations (role-based access)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    let query = '';
    let params: any[] = [];

    if (req.user.role === 'owner') {
      // Owner sees all organizations
      query = `
        SELECT 
          o.*, 
          a.name as agent_name,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'admin') as admin_count,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'staff') as staff_count,
          (SELECT COUNT(*) FROM id_cards ic WHERE ic.organization_id = o.id) as id_card_count
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        ORDER BY o.created_at DESC
      `;
    } else if (req.user.role === 'agent') {
      // Agent sees only organizations they created
      query = `
        SELECT 
          o.*, 
          a.name as agent_name,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'admin') as admin_count,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'staff') as staff_count,
          (SELECT COUNT(*) FROM id_cards ic WHERE ic.organization_id = o.id) as id_card_count
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        WHERE o.agent_id = ? 
        ORDER BY o.created_at DESC
      `;
      params = [req.user.id];
    } else if (req.user.role === 'admin') {
      // Admin sees only their organization
      query = `
        SELECT 
          o.*, 
          a.name as agent_name,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'admin') as admin_count,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'staff') as staff_count,
          (SELECT COUNT(*) FROM id_cards ic WHERE ic.organization_id = o.id) as id_card_count
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        WHERE o.id = ?
      `;
      params = [req.user.organization_id];
    } else {
      // Staff cannot see organizations
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Staff cannot view organizations.' 
      });
    }

    const [organizations] = await pool.execute(query, params);
    
    res.json({ 
      success: true,
      data: { organizations } 
    });

  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load organizations' 
    });
  }
});

// Get organization by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.params.id;

    // Check access permissions
    if (req.user.role === 'admin' && req.user.organization_id !== parseInt(orgId)) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    if (req.user.role === 'agent') {
      const [agentOrgs] = await pool.execute(
        'SELECT id FROM organizations WHERE id = ? AND agent_id = ?',
        [orgId, req.user.id]
      );
      if ((agentOrgs as any[]).length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
      }
    }

    const [organizations] = await pool.execute(
      `SELECT 
          o.*, 
          a.name as agent_name,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'admin') as admin_count,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.role = 'staff') as staff_count,
          (SELECT COUNT(*) FROM id_cards ic WHERE ic.organization_id = o.id) as id_card_count
       FROM organizations o 
       LEFT JOIN agents a ON o.agent_id = a.id 
       WHERE o.id = ?`,
      [orgId]
    );

    const orgArray = organizations as any[];
    if (orgArray.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Organization not found' 
      });
    }

    // Get admin users for this organization
    const [admins] = await pool.execute(
      `SELECT id, name, mobile, status, created_at 
       FROM users 
       WHERE organization_id = ? AND role = 'admin' 
       ORDER BY created_at DESC`,
      [orgId]
    );

    // Get staff count by department
    const [departmentStats] = await pool.execute(
      `SELECT 
          department,
          COUNT(*) as count 
       FROM users 
       WHERE organization_id = ? AND role = 'staff' AND status = 'active'
       GROUP BY department 
       ORDER BY count DESC`,
      [orgId]
    );

    res.json({ 
      success: true,
      data: {
        organization: orgArray[0],
        admins,
        departmentStats,
        summary: {
          totalAdmins: orgArray[0].admin_count || 0,
          totalStaff: orgArray[0].staff_count || 0,
          totalIdCards: orgArray[0].id_card_count || 0
        }
      }
    });

  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load organization details' 
    });
  }
});

// Update organization (by agent or owner)
router.put('/:id', authenticateToken, requireRole(['owner', 'agent', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.params.id;
    const {
      name,
      address,
      mobile,
      email,
      contactPerson,
      designation,
      logoUrl,
      color
    } = req.body;

    // Check permissions
    if (req.user.role === 'agent') {
      const [agentOrgs] = await pool.execute(
        'SELECT id FROM organizations WHERE id = ? AND agent_id = ?',
        [orgId, req.user.id]
      );
      if ((agentOrgs as any[]).length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
      }
    } else if (req.user.role === 'admin' && req.user.organization_id !== parseInt(orgId)) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }
    if (mobile !== undefined) {
      updateFields.push('mobile = ?');
      updateValues.push(mobile);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (contactPerson !== undefined) {
      updateFields.push('contact_person = ?');
      updateValues.push(contactPerson);
    }
    if (designation !== undefined) {
      updateFields.push('designation = ?');
      updateValues.push(designation);
    }
    if (logoUrl !== undefined) {
      updateFields.push('logo_url = ?');
      updateValues.push(logoUrl);
    }
    if (color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(color);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No fields to update' 
      });
    }

    updateValues.push(orgId);

    const [result] = await pool.execute(
      `UPDATE organizations SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Organization not found' 
      });
    }

    // If mobile was updated, also update the admin user's mobile
    if (mobile !== undefined) {
      await pool.execute(
        'UPDATE users SET mobile = ? WHERE organization_id = ? AND role = "admin"',
        [mobile, orgId]
      );
    }

    res.json({ 
      success: true,
      message: 'Organization updated successfully',
      data: { updated: true }
    });

  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update organization' 
    });
  }
});

// Delete organization (soft delete - by owner or agent)
router.delete('/:id', authenticateToken, requireRole(['owner', 'agent']), async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.params.id;

    // Check permissions
    if (req.user.role === 'agent') {
      const [agentOrgs] = await pool.execute(
        'SELECT id FROM organizations WHERE id = ? AND agent_id = ?',
        [orgId, req.user.id]
      );
      if ((agentOrgs as any[]).length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
      }
    }

    // Soft delete: mark as inactive
    const [result] = await pool.execute(
      'UPDATE organizations SET status = "inactive" WHERE id = ?',
      [orgId]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Organization not found' 
      });
    }

    // Also deactivate all users in this organization
    await pool.execute(
      'UPDATE users SET status = "inactive" WHERE organization_id = ?',
      [orgId]
    );

    res.json({ 
      success: true,
      message: 'Organization and associated users deactivated successfully'
    });

  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete organization' 
    });
  }
});

// Get organization stats (for dashboard)
router.get('/:id/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.params.id;

    // Check permissions
    if (req.user.role === 'admin' && req.user.organization_id !== parseInt(orgId)) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied' 
      });
    }

    if (req.user.role === 'agent') {
      const [agentOrgs] = await pool.execute(
        'SELECT id FROM organizations WHERE id = ? AND agent_id = ?',
        [orgId, req.user.id]
      );
      if ((agentOrgs as any[]).length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied' 
        });
      }
    }

    // Get various stats
    const [totalStaff] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND role = "staff" AND status = "active"',
      [orgId]
    );

    const [totalIdCards] = await pool.execute(
      'SELECT COUNT(*) as count FROM id_cards WHERE organization_id = ?',
      [orgId]
    );

    const [recentIdCards] = await pool.execute(
      `SELECT COUNT(*) as count FROM id_cards 
       WHERE organization_id = ? 
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [orgId]
    );

    const [departmentStats] = await pool.execute(
      `SELECT 
          department,
          COUNT(*) as count 
       FROM users 
       WHERE organization_id = ? AND role = 'staff' AND status = 'active'
       GROUP BY department 
       ORDER BY count DESC
       LIMIT 5`,
      [orgId]
    );

    res.json({ 
      success: true,
      data: {
        totalStaff: (totalStaff as any[])[0]?.count || 0,
        totalIdCards: (totalIdCards as any[])[0]?.count || 0,
        recentIdCards: (recentIdCards as any[])[0]?.count || 0,
        departmentStats
      }
    });

  } catch (error) {
    console.error('Get organization stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load organization statistics' 
    });
  }
});

export default router;