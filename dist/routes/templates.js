"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/templates.ts
const express_1 = __importDefault(require("express"));
const database_1 = __importDefault(require("../utils/database"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Available fields for templates (must match frontend)
const AVAILABLE_FIELDS = [
    'photo', 'id_no', 'name', 'father_name', 'mother_name', 'dob',
    'blood_group', 'address', 'mobile', 'email', 'department',
    'position', 'issue_date', 'expiry_date'
];
/** Helper */
const badRequest = (res, message) => res.status(400).json({ error: message });
/** 🔥 SAFE JSON PARSER */
const safeParse = (value) => {
    try {
        return typeof value === "string" ? JSON.parse(value) : value;
    }
    catch {
        return null;
    }
};
/**
 * ================================
 * CREATE TEMPLATE
 * ================================
 */
router.post('/', auth_1.authenticateToken, (0, auth_1.requireRole)(['admin']), async (req, res) => {
    try {
        const { name, cardSize = 'standard', orientation = 'horizontal', isDoubleSided = false, backgroundColor = '#ffffff', textColor = '#000000', backgroundImageUrl, fields } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return badRequest(res, 'Template name is required');
        }
        const organizationId = req.user?.organization_id;
        if (!organizationId) {
            return res.status(400).json({ error: 'You are not assigned to any organization.' });
        }
        const [orgRows] = await database_1.default.execute('SELECT id FROM organizations WHERE id = ?', [organizationId]);
        if (orgRows.length === 0) {
            return res.status(404).json({ error: 'Organization does not exist.' });
        }
        if (!Array.isArray(fields) || fields.length === 0) {
            return badRequest(res, 'fields must be a non-empty array');
        }
        const invalidFields = fields.filter((f) => typeof f !== 'string' || !AVAILABLE_FIELDS.includes(f));
        if (invalidFields.length > 0) {
            return badRequest(res, `Invalid fields: ${invalidFields.join(', ')}`);
        }
        const [existing] = await database_1.default.execute('SELECT id FROM templates WHERE name = ? AND organization_id = ?', [name.trim(), organizationId]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Template name already exists' });
        }
        const [result] = await database_1.default.execute(`INSERT INTO templates (name, organization_id, card_size, orientation, is_double_sided,
         background_color, text_color, background_image_url, fields)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            name.trim(),
            organizationId,
            cardSize,
            orientation,
            isDoubleSided ? 1 : 0,
            backgroundColor,
            textColor,
            backgroundImageUrl || null,
            JSON.stringify(fields) // Store safely
        ]);
        const templateId = result.insertId;
        res.status(201).json({ success: true, message: 'Template created successfully', templateId });
    }
    catch (error) {
        console.error('🔥 MYSQL ERROR (create template):', error?.sqlMessage ?? error?.message ?? error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * ================================
 * GET ALL TEMPLATES
 * ================================
 */
router.get('/', auth_1.authenticateToken, (0, auth_1.requireRole)(['admin', 'staff']), async (req, res) => {
    try {
        const organizationId = req.user?.organization_id;
        if (!organizationId) {
            return res.status(400).json({ error: 'You are not assigned to any organization.' });
        }
        const [templates] = await database_1.default.execute(`SELECT t.*, o.name as organization_name
       FROM templates t
       LEFT JOIN organizations o ON t.organization_id = o.id
       WHERE t.organization_id = ?
       ORDER BY t.created_at DESC`, [organizationId]);
        const parsed = templates.map(t => {
            const parsedFields = safeParse(t.fields);
            if (!parsedFields || !Array.isArray(parsedFields)) {
                console.error("Invalid JSON in DB for template:", t.id);
                return { ...t, fields: [] };
            }
            return { ...t, fields: parsedFields };
        });
        res.json({ success: true, templates: parsed });
    }
    catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * ================================
 * GET TEMPLATE BY ID
 * ================================
 */
router.get('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['admin', 'staff']), async (req, res) => {
    try {
        const templateId = req.params.id;
        const organizationId = req.user.organization_id;
        const [templates] = await database_1.default.execute(`SELECT * FROM templates WHERE id = ? AND organization_id = ?`, [templateId, organizationId]);
        if (templates.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }
        const template = templates[0];
        const parsedFields = safeParse(template.fields);
        res.json({ success: true, template: { ...template, fields: parsedFields ?? [] } });
    }
    catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * ================================
 * UPDATE TEMPLATE
 * ================================
 */
router.put('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['admin']), async (req, res) => {
    try {
        const templateId = req.params.id;
        const organizationId = req.user.organization_id;
        const { name, cardSize, orientation, isDoubleSided, backgroundColor, textColor, backgroundImageUrl, fields } = req.body;
        if (!organizationId) {
            return res.status(400).json({ error: 'You are not assigned to any organization.' });
        }
        if (fields && !Array.isArray(fields)) {
            return badRequest(res, 'fields must be an array');
        }
        await database_1.default.execute(`UPDATE templates
       SET name = ?, card_size = ?, orientation = ?, is_double_sided = ?,
           background_color = ?, text_color = ?, background_image_url = ?, fields = ?
       WHERE id = ? AND organization_id = ?`, [
            name,
            cardSize,
            orientation,
            isDoubleSided ? 1 : 0,
            backgroundColor,
            textColor,
            backgroundImageUrl || null,
            JSON.stringify(fields || []),
            templateId,
            organizationId
        ]);
        res.json({ success: true, message: 'Template updated successfully' });
    }
    catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * ================================
 * DELETE TEMPLATE
 * ================================
 */
router.delete('/:id', auth_1.authenticateToken, (0, auth_1.requireRole)(['admin']), async (req, res) => {
    try {
        const templateId = req.params.id;
        const organizationId = req.user.organization_id;
        await database_1.default.execute('DELETE FROM templates WHERE id = ? AND organization_id = ?', [templateId, organizationId]);
        res.json({ success: true, message: 'Template deleted successfully' });
    }
    catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/** Available fields */
router.get('/options/available-fields', auth_1.authenticateToken, (req, res) => {
    res.json({ fields: AVAILABLE_FIELDS });
});
exports.default = router;
