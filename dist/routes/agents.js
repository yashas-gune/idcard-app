"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/agents.ts
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../utils/database"));
const pinUtils_1 = require("../utils/pinUtils");
const router = express_1.default.Router();
// GET all agents
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const [agents] = await database_1.default.execute(`
      SELECT id, name, mobile, email, working_area, status, created_at 
      FROM agents 
      WHERE status = 'active'
    `);
        res.json({ agents });
    }
    catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST create new agent
router.post('/register-agent', auth_1.authenticateToken, async (req, res) => {
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
        const [existingMobileRows] = await database_1.default.execute('SELECT id FROM agents WHERE mobile = ?', [mobile]);
        if (existingMobileRows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Mobile number already exists'
            });
        }
        // Check if Aadhaar already exists - PROPERLY TYPED
        const [existingAadhaarRows] = await database_1.default.execute('SELECT id FROM agents WHERE aadhaar_no = ?', [aadhaarNo]);
        if (existingAadhaarRows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Aadhaar number already exists'
            });
        }
        // Hash the PIN
        const pinHash = await (0, pinUtils_1.hashPin)(pin);
        // Insert into AGENTS table - PROPERLY TYPED
        const [result] = await database_1.default.execute(`INSERT INTO agents 
       (name, address, aadhaar_no, mobile, email, pin_hash, working_area, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`, [name, address, aadhaarNo, mobile, email, pinHash, workingArea]);
        console.log('🟢 Agent created successfully with ID:', result.insertId);
        res.json({
            success: true,
            message: 'Agent registered successfully',
            agentId: result.insertId
        });
    }
    catch (error) {
        console.error('🔴 Backend error in agent registration:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
});
exports.default = router;
