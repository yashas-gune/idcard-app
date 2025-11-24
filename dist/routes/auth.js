"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../utils/database"));
const pinUtils_1 = require("../utils/pinUtils");
const router = express_1.default.Router();
// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { mobile, pin } = req.body;
        if (!mobile || !pin) {
            return res.status(400).json({ error: 'Mobile and PIN are required' });
        }
        console.log('🔐 Login attempt for mobile:', mobile);
        // Find user by mobile
        const [users] = await database_1.default.execute('SELECT * FROM users WHERE mobile = ? AND status = "active"', [mobile]);
        const userArray = users;
        if (userArray.length === 0) {
            console.log('❌ User not found:', mobile);
            return res.status(401).json({ error: 'Invalid mobile or PIN' });
        }
        const user = userArray[0];
        console.log('👤 User found:', user.name, 'Role:', user.role);
        // Verify PIN using our utility
        const isValidPin = await (0, pinUtils_1.verifyPin)(pin, user.pin_hash);
        if (!isValidPin) {
            console.log('❌ Invalid PIN for user:', user.name);
            return res.status(401).json({ error: 'Invalid mobile or PIN' });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            mobile: user.mobile,
            role: user.role,
            organization_id: user.organization_id
        }, process.env.JWT_SECRET, { expiresIn: '24h' });
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
    }
    catch (error) {
        console.error('🔥 Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
