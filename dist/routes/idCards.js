"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/idCards.ts
const express_1 = __importDefault(require("express"));
const database_1 = __importDefault(require("../utils/database"));
const auth_1 = require("../middleware/auth");
const userSanitizer_1 = require("../middleware/userSanitizer");
const userServices_1 = require("../services/userServices");
const router = express_1.default.Router();
// Helper function for safe JSON parsing
const safeJsonParse = (jsonString) => {
    try {
        if (typeof jsonString === 'string') {
            const parsed = JSON.parse(jsonString);
            return Array.isArray(parsed) ? parsed : [];
        }
        return Array.isArray(jsonString) ? jsonString : [];
    }
    catch (error) {
        console.error('JSON parsing error:', error);
        return [];
    }
};
// Helper function to convert DD/MM/YYYY to YYYY-MM-DD for MySQL
const convertToMySQLDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string')
        return null;
    // Handle DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts;
        // Validate the parts are numbers and valid date
        if (day && month && year &&
            !isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }
    // If already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }
    return null;
};
// Helper function to convert MySQL Date object to DD/MM/YYYY for frontend
const convertToDisplayDate = (mysqlDate) => {
    if (!mysqlDate)
        return null;
    // If it's already a string in YYYY-MM-DD format
    if (typeof mysqlDate === 'string') {
        const parts = mysqlDate.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day}/${month}/${year}`;
        }
        return mysqlDate;
    }
    // If it's a Date object
    if (mysqlDate instanceof Date) {
        const day = String(mysqlDate.getDate()).padStart(2, '0');
        const month = String(mysqlDate.getMonth() + 1).padStart(2, '0');
        const year = mysqlDate.getFullYear();
        return `${day}/${month}/${year}`;
    }
    // If it's any other type, convert to string first
    const dateString = String(mysqlDate);
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }
    return dateString;
};
// Create new ID card
router.post('/', auth_1.authenticateToken, userSanitizer_1.sanitizeUserData, (0, auth_1.requireRole)(['admin', 'staff']), async (req, res) => {
    try {
        // Use service for business logic validation
        const businessUser = (0, userServices_1.getUserForIdCardOperations)(req.user);
        // Check if user can create ID cards
        if (!businessUser.canCreateTemplates) {
            return res.status(403).json({ error: 'Not authorized to create ID cards' });
        }
        const { templateId, name, idNo, fatherName, motherName, dob, bloodGroup, address, mobile, email, department, photoUrl, expiryDate } = req.body;
        // Basic validation
        if (!templateId || !name || !idNo || !photoUrl) {
            return res.status(400).json({
                error: 'Template, name, ID number, and photo are required'
            });
        }
        const organizationId = req.user.organization_id;
        const createdBy = req.user.id;
        // Verify template belongs to organization
        const [templates] = await database_1.default.execute(`SELECT t.*, t.fields as template_fields 
       FROM templates t 
       WHERE t.id = ? AND t.organization_id = ?`, [templateId, organizationId]);
        if (templates.length === 0) {
            return res.status(400).json({ error: 'Invalid template' });
        }
        const template = templates[0];
        // SAFE JSON PARSING - FIXED
        const requiredFields = safeJsonParse(template.fields);
        // Validate required fields based on template
        const missingFields = [];
        if (requiredFields.includes('name') && !name)
            missingFields.push('name');
        if (requiredFields.includes('id_no') && !idNo)
            missingFields.push('id_no');
        if (requiredFields.includes('photo') && !photoUrl)
            missingFields.push('photo');
        // Only validate these if they are in requiredFields
        if (requiredFields.includes('mobile') && !mobile)
            missingFields.push('mobile');
        if (requiredFields.includes('dob') && !dob)
            missingFields.push('dob');
        if (requiredFields.includes('blood_group') && !bloodGroup)
            missingFields.push('blood_group');
        if (requiredFields.includes('email') && !email)
            missingFields.push('email');
        if (requiredFields.includes('address') && !address)
            missingFields.push('address');
        if (requiredFields.includes('father_name') && !fatherName)
            missingFields.push('father_name');
        if (requiredFields.includes('mother_name') && !motherName)
            missingFields.push('mother_name');
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }
        // Check ID card limits using service data
        const [existingCount] = await database_1.default.execute('SELECT COUNT(*) as count FROM id_cards WHERE created_by = ?', [req.user.id]);
        const currentCount = existingCount[0].count;
        if (currentCount >= businessUser.maxIdCards) {
            return res.status(400).json({
                error: `Maximum ID card limit (${businessUser.maxIdCards}) reached. Please contact administrator.`
            });
        }
        // Check if ID number already exists in organization
        const [existingCards] = await database_1.default.execute('SELECT id FROM id_cards WHERE id_no = ? AND organization_id = ?', [idNo, organizationId]);
        if (existingCards.length > 0) {
            return res.status(400).json({ error: 'ID number already exists in this organization' });
        }
        // Convert date format for MySQL
        const mysqlDob = convertToMySQLDate(dob);
        const mysqlExpiryDate = expiryDate ? convertToMySQLDate(expiryDate) : null;
        console.log('📅 Date conversion:', { input: dob, output: mysqlDob });
        // Create ID card
        const [result] = await database_1.default.execute(`INSERT INTO id_cards (
        template_id, organization_id, department, created_by,
        name, id_no, father_name, mother_name, dob, blood_group,
        address, mobile, email, photo_url, status, expiry_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`, [
            templateId,
            organizationId,
            department || null,
            createdBy,
            name,
            idNo,
            fatherName || null,
            motherName || null,
            mysqlDob, // ← Now in correct format for MySQL (YYYY-MM-DD)
            bloodGroup || null,
            address || null,
            mobile || null,
            email || null,
            photoUrl,
            mysqlExpiryDate
        ]);
        const idCardId = result.insertId;
        // Get the created ID card with template details
        const [idCards] = await database_1.default.execute(`SELECT ic.*, t.name as template_name, t.fields as template_fields,
              o.name as organization_name, u.name as creator_name
       FROM id_cards ic
       LEFT JOIN templates t ON ic.template_id = t.id
       LEFT JOIN organizations o ON ic.organization_id = o.id
       LEFT JOIN users u ON ic.created_by = u.id
       WHERE ic.id = ?`, [idCardId]);
        const idCard = idCards[0];
        console.log('📊 Retrieved ID card date type:', typeof idCard.dob, idCard.dob);
        res.status(201).json({
            message: 'ID card created successfully',
            idCard: {
                ...idCard,
                // Convert dates back to DD/MM/YYYY for frontend
                dob: convertToDisplayDate(idCard.dob),
                expiry_date: convertToDisplayDate(idCard.expiry_date),
                // SAFE JSON PARSING - FIXED
                template_fields: safeJsonParse(idCard.template_fields)
            }
        });
    }
    catch (error) {
        console.error('ID card creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get ID cards with role-based filtering
router.get('/', auth_1.authenticateToken, userSanitizer_1.sanitizeUserData, async (req, res) => {
    try {
        // Use service for consistent user data
        const safeUser = (0, userServices_1.getUserWithDefaults)(req.user);
        let query = '';
        let params = [];
        if (safeUser.role === 'owner') {
            // Owner sees all ID cards
            query = `
        SELECT ic.*, t.name as template_name, o.name as organization_name, 
               u.name as creator_name, a.name as agent_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        LEFT JOIN users u ON ic.created_by = u.id
        LEFT JOIN agents a ON o.agent_id = a.id
        ORDER BY ic.created_at DESC
      `;
        }
        else if (safeUser.role === 'admin') {
            // Admin sees all ID cards in their organization
            query = `
        SELECT ic.*, t.name as template_name, o.name as organization_name, u.name as creator_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        LEFT JOIN users u ON ic.created_by = u.id
        WHERE ic.organization_id = ?
        ORDER BY ic.created_at DESC
      `;
            params = [safeUser.organization_id];
        }
        else if (safeUser.role === 'staff') {
            // Staff sees ID cards they created
            // NO MORE ERRORS - department is guaranteed by sanitizer and service
            const userDept = safeUser.department; // ← Always has a value
            query = `
        SELECT ic.*, t.name as template_name, o.name as organization_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        WHERE ic.created_by = ? 
        AND (
          -- Show cards matching user's department OR cards with no department
          ic.department = ? 
          OR ic.department IS NULL
          OR ? IS NULL
        )
        ORDER BY ic.created_at DESC
      `;
            // Safe parameters - no undefined values
            params = [safeUser.id, userDept, userDept];
            console.log('🔧 Staff query with safe params:', { userId: safeUser.id, department: userDept });
        }
        const [idCards] = await database_1.default.execute(query, params);
        // SAFE JSON PARSING for all ID cards - FIXED
        const idCardsWithSafeFields = idCards.map(card => ({
            ...card,
            // Convert dates back to DD/MM/YYYY for frontend
            dob: convertToDisplayDate(card.dob),
            expiry_date: convertToDisplayDate(card.expiry_date),
            template_fields: safeJsonParse(card.template_fields || '[]')
        }));
        res.json({
            success: true,
            data: {
                idCards: idCardsWithSafeFields
            }
        });
    }
    catch (error) {
        console.error('Get ID cards error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});
// Get ID card by ID
router.get('/:id', auth_1.authenticateToken, userSanitizer_1.sanitizeUserData, async (req, res) => {
    try {
        const idCardId = req.params.id;
        const safeUser = (0, userServices_1.getUserWithDefaults)(req.user);
        let query = '';
        let params = [idCardId];
        if (safeUser.role === 'staff') {
            // Staff can only see their own ID cards
            query = `
        SELECT ic.*, t.name as template_name, t.fields as template_fields,
               o.name as organization_name, u.name as creator_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        LEFT JOIN users u ON ic.created_by = u.id
        WHERE ic.id = ? AND ic.created_by = ?
      `;
            params = [idCardId, safeUser.id];
        }
        else if (safeUser.role === 'admin') {
            // Admin can see any ID card in their organization
            query = `
        SELECT ic.*, t.name as template_name, t.fields as template_fields,
               o.name as organization_name, u.name as creator_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        LEFT JOIN users u ON ic.created_by = u.id
        WHERE ic.id = ? AND ic.organization_id = ?
      `;
            params = [idCardId, safeUser.organization_id];
        }
        else {
            // Owner can see any ID card
            query = `
        SELECT ic.*, t.name as template_name, t.fields as template_fields,
               o.name as organization_name, u.name as creator_name, a.name as agent_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        LEFT JOIN users u ON ic.created_by = u.id
        LEFT JOIN agents a ON o.agent_id = a.id
        WHERE ic.id = ?
      `;
        }
        const [idCards] = await database_1.default.execute(query, params);
        const idCardArray = idCards;
        if (idCardArray.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'ID card not found'
            });
        }
        const idCard = idCardArray[0];
        res.json({
            success: true,
            data: {
                idCard: {
                    ...idCard,
                    // Convert dates back to DD/MM/YYYY for frontend
                    dob: convertToDisplayDate(idCard.dob),
                    expiry_date: convertToDisplayDate(idCard.expiry_date),
                    // SAFE JSON PARSING - FIXED
                    template_fields: safeJsonParse(idCard.template_fields)
                }
            }
        });
    }
    catch (error) {
        console.error('Get ID card error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});
// Update ID card status (active/expired)
router.patch('/:id/status', auth_1.authenticateToken, userSanitizer_1.sanitizeUserData, (0, auth_1.requireRole)(['admin']), async (req, res) => {
    try {
        const idCardId = req.params.id;
        const { status } = req.body;
        const safeUser = (0, userServices_1.getUserWithDefaults)(req.user);
        const organizationId = safeUser.organization_id;
        if (!['active', 'expired'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status must be active or expired'
            });
        }
        const [result] = await database_1.default.execute('UPDATE id_cards SET status = ? WHERE id = ? AND organization_id = ?', [status, idCardId, organizationId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'ID card not found'
            });
        }
        res.json({
            success: true,
            message: `ID card status updated to ${status}`
        });
    }
    catch (error) {
        console.error('Update ID card status error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});
// Get ID cards by department
router.get('/department/:department', auth_1.authenticateToken, userSanitizer_1.sanitizeUserData, (0, auth_1.requireRole)(['admin']), async (req, res) => {
    try {
        const department = req.params.department;
        const safeUser = (0, userServices_1.getUserWithDefaults)(req.user);
        const organizationId = safeUser.organization_id;
        const [idCards] = await database_1.default.execute(`SELECT ic.*, t.name as template_name, u.name as creator_name
       FROM id_cards ic
       LEFT JOIN templates t ON ic.template_id = t.id
       LEFT JOIN users u ON ic.created_by = u.id
       WHERE ic.organization_id = ? AND ic.department = ?
       ORDER BY ic.created_at DESC`, [organizationId, department]);
        const idCardsWithSafeFields = idCards.map(card => ({
            ...card,
            dob: convertToDisplayDate(card.dob),
            expiry_date: convertToDisplayDate(card.expiry_date),
            template_fields: safeJsonParse(card.template_fields || '[]')
        }));
        res.json({
            success: true,
            data: {
                idCards: idCardsWithSafeFields
            }
        });
    }
    catch (error) {
        console.error('Get ID cards by department error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});
// Get current user's ID cards (for MyIDs page)
router.get('/my/cards', auth_1.authenticateToken, userSanitizer_1.sanitizeUserData, async (req, res) => {
    try {
        const safeUser = (0, userServices_1.getUserWithDefaults)(req.user);
        let query = '';
        let params = [];
        if (safeUser.role === 'staff') {
            // Staff sees only their created ID cards
            const userDept = safeUser.department;
            query = `
        SELECT ic.*, t.name as template_name, o.name as organization_name
        FROM id_cards ic
        LEFT JOIN templates t ON ic.template_id = t.id
        LEFT JOIN organizations o ON ic.organization_id = o.id
        WHERE ic.created_by = ?
        AND (
          ic.department = ? 
          OR ic.department IS NULL
          OR ? IS NULL
        )
        ORDER BY ic.created_at DESC
      `;
            params = [safeUser.id, userDept, userDept];
        }
        else {
            // For admin/owner, use the regular endpoint
            return res.redirect(`/api/id-cards`);
        }
        const [idCards] = await database_1.default.execute(query, params);
        const idCardsWithSafeFields = idCards.map(card => ({
            ...card,
            dob: convertToDisplayDate(card.dob),
            expiry_date: convertToDisplayDate(card.expiry_date),
            template_fields: safeJsonParse(card.template_fields || '[]')
        }));
        res.json({
            success: true,
            data: {
                idCards: idCardsWithSafeFields
            }
        });
    }
    catch (error) {
        console.error('Get my ID cards error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});
exports.default = router;
