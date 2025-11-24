"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = __importDefault(require("../utils/database"));
const auth_1 = require("../middleware/auth");
const pinUtils_1 = require("../utils/pinUtils");
const router = express_1.default.Router();
// Create new organization (by agent or owner) - UPDATED: agentId is now required
router.post('/', auth_1.authenticateToken, (0, auth_1.requireRole)(['owner', 'agent']), async (req, res) => {
    try {
        const { name, address, mobile, email, contactPerson, designation, pin, logoUrl, color = '#2563eb', agentId // ADDED: Required agent ID
         } = req.body;
        console.log('📦 Received organization data:', {
            name, address, mobile, email, contactPerson, designation, pin, logoUrl, color, agentId
        });
        // Validation with better error messages - ADDED agentId validation
        if (!name)
            return res.status(400).json({ error: 'Organization name is required' });
        if (!address)
            return res.status(400).json({ error: 'Address is required' });
        if (!mobile)
            return res.status(400).json({ error: 'Mobile number is required' });
        if (!email)
            return res.status(400).json({ error: 'Email is required' });
        if (!contactPerson)
            return res.status(400).json({ error: 'Contact person is required' });
        if (!designation)
            return res.status(400).json({ error: 'Designation is required' });
        if (!pin)
            return res.status(400).json({ error: 'PIN is required' });
        if (!agentId)
            return res.status(400).json({ error: 'Agent ID is required' }); // ADDED
        if (pin.length !== 4) {
            return res.status(400).json({ error: 'PIN must be 4 digits' });
        }
        // ADDED: Verify agent exists
        const [agents] = await database_1.default.execute('SELECT id, name FROM agents WHERE id = ? AND status = "active"', [agentId]);
        if (agents.length === 0) {
            return res.status(400).json({ error: 'Invalid agent ID' });
        }
        const agent = agents[0];
        // Check if organization name already exists
        const [existingOrgs] = await database_1.default.execute('SELECT id FROM organizations WHERE name = ?', [name]);
        if (existingOrgs.length > 0) {
            return res.status(400).json({ error: 'Organization name already exists' });
        }
        const hashedPin = await (0, pinUtils_1.hashPin)(pin);
        console.log('🔧 Processed data:', {
            hashedPin: hashedPin.substring(0, 20) + '...',
            agentId,
            agentName: agent.name, // ADDED
            userRole: req.user.role
        });
        const connection = await database_1.default.getConnection();
        await connection.beginTransaction();
        try {
            // 1. Create organization - handle null/undefined explicitly
            const [orgResult] = await connection.execute(`INSERT INTO organizations (name, address, mobile, email, contact_person, designation, pin_hash, logo_url, color, agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
            const orgId = orgResult.insertId;
            console.log('✅ Organization created with ID:', orgId, 'by agent:', agent.name); // UPDATED
            // 2. Create admin user for this organization
            const adminPin = await (0, pinUtils_1.hashPin)('1234'); // Default admin PIN
            const [adminResult] = await connection.execute(`INSERT INTO users (name, mobile, pin_hash, role, organization_id, status)
         VALUES (?, ?, ?, 'admin', ?, 'active')`, [contactPerson, mobile, adminPin, orgId]);
            const adminId = adminResult.insertId;
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
        }
        catch (error) {
            await connection.rollback();
            console.error('❌ Transaction error:', error);
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error('🔥 Organization creation error:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});
// Get organizations (role-based access) - UNCHANGED
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        let query = '';
        let params = [];
        if (req.user.role === 'owner') {
            // Owner sees all organizations
            query = `
        SELECT o.*, a.name as agent_name 
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        ORDER BY o.created_at DESC
      `;
        }
        else if (req.user.role === 'agent') {
            // Agent sees only organizations they created
            query = `
        SELECT o.*, a.name as agent_name 
        FROM organizations o 
        LEFT JOIN agents a ON o.agent_id = a.id 
        WHERE o.agent_id = ? 
        ORDER BY o.created_at DESC
      `;
            params = [req.user.id];
        }
        else if (req.user.role === 'admin') {
            // Admin sees only their organization
            query = 'SELECT * FROM organizations WHERE id = ?';
            params = [req.user.organization_id];
        }
        else {
            // Staff cannot see organizations
            return res.status(403).json({ error: 'Access denied' });
        }
        const [organizations] = await database_1.default.execute(query, params);
        res.json({ organizations });
    }
    catch (error) {
        console.error('Get organizations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get organization by ID - UNCHANGED
router.get('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const orgId = req.params.id;
        // Check access permissions
        if (req.user.role === 'admin' && req.user.organization_id != orgId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (req.user.role === 'agent') {
            const [agentOrgs] = await database_1.default.execute('SELECT id FROM organizations WHERE id = ? AND agent_id = ?', [orgId, req.user.id]);
            if (agentOrgs.length === 0) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }
        const [organizations] = await database_1.default.execute(`SELECT o.*, a.name as agent_name 
       FROM organizations o 
       LEFT JOIN agents a ON o.agent_id = a.id 
       WHERE o.id = ?`, [orgId]);
        const orgArray = organizations;
        if (orgArray.length === 0) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json({ organization: orgArray[0] });
    }
    catch (error) {
        console.error('Get organization error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
