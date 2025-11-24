"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = __importDefault(require("../utils/database")); // Your DB connection
const auth_1 = require("../middleware/auth");
const pinUtils_1 = require("../utils/pinUtils"); // Assuming you have this helper
const router = express_1.default.Router();
// 1. GET ALL USERS (Filtered by Organization)
router.get('/', auth_1.authenticateToken, async (req, res) => {
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
        const [users] = await database_1.default.execute(query, params);
        res.json({ users }); // Send real list back
    }
    catch (error) {
        console.error('Fetch Users Error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});
// 2. CREATE STAFF (Auto-Link Organization)
router.post('/register-staff', auth_1.authenticateToken, (0, auth_1.requireRole)(['admin']), async (req, res) => {
    try {
        const { name, mobile, pin, department, email } = req.body;
        // CRITICAL: Get Org ID from the logged-in Admin's token
        const organizationId = req.user.organization_id;
        // SAFETY CHECK
        if (!organizationId) {
            return res.status(403).json({ error: "You (Admin) are not linked to an Organization. Cannot create staff." });
        }
        // Check duplicates
        const [existing] = await database_1.default.execute('SELECT id FROM users WHERE mobile = ?', [mobile]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Mobile already registered' });
        }
        const hashedPin = await (0, pinUtils_1.hashPin)(pin);
        // INSERT into DB
        const [result] = await database_1.default.execute(`INSERT INTO users (name, mobile, pin_hash, role, organization_id, department, email, status) 
       VALUES (?, ?, ?, 'staff', ?, ?, ?, 'active')`, [name, mobile, hashedPin, organizationId, department, email || null]);
        res.status(201).json({
            message: 'Staff created successfully',
            user: { id: result.insertId, name, mobile }
        });
    }
    catch (error) {
        console.error('Create Staff Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
exports.default = router;
