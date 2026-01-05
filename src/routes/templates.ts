// src/routes/templates.ts
import express, { Request, Response } from 'express';
import pool from '../utils/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Available fields for templates (must match frontend)
const AVAILABLE_FIELDS = [
  'photo', 'id_no', 'name', 'father_name', 'mother_name', 'dob',
  'blood_group', 'address', 'mobile', 'email', 'department',
  'position', 'issue_date', 'expiry_date'
];

/** Helper */
const badRequest = (res: Response, message: string) =>
  res.status(400).json({ error: message });

/** 🔥 SAFE JSON PARSER */
const safeParse = (value: any) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};

/** Helper to clean field for validation (remove front:/back: prefixes) */
const cleanFieldForValidation = (field: string): string => {
  return field.replace(/^(front:|back:)/, '');
};

/** Helper to parse fields into front/back arrays */
const parseFieldsToSides = (fields: string[]) => {
  const frontFields: string[] = [];
  const backFields: string[] = [];
  
  fields.forEach((field: string) => {
    if (field.startsWith('back:')) {
      backFields.push(field.replace('back:', ''));
    } else if (field.startsWith('front:')) {
      frontFields.push(field.replace('front:', ''));
    } else {
      // Legacy: no prefix means front
      frontFields.push(field);
    }
  });
  
  return { frontFields, backFields };
};

/**
 * ================================
 * CREATE TEMPLATE
 * ================================
 */
router.post('/', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      cardSize = 'standard',
      orientation = 'horizontal',
      isDoubleSided = false,
      backgroundColor = '#ffffff',
      textColor = '#000000',
      backgroundImageUrl,
      fields
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return badRequest(res, 'Template name is required');
    }

    const organizationId = req.user?.organization_id;
    if (!organizationId) {
      return res.status(400).json({ error: 'You are not assigned to any organization.' });
    }

    const [orgRows] = await pool.execute('SELECT id FROM organizations WHERE id = ?', [organizationId]);
    if ((orgRows as any[]).length === 0) {
      return res.status(404).json({ error: 'Organization does not exist.' });
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return badRequest(res, 'fields must be a non-empty array');
    }

    // UPDATED VALIDATION: Strip prefixes before checking
    const invalidFields = fields.filter((f: any) => {
      if (typeof f !== 'string') return true;
      
      // Remove front: or back: prefixes before validation
      const cleanField = cleanFieldForValidation(f);
      return !AVAILABLE_FIELDS.includes(cleanField);
    });

    if (invalidFields.length > 0) {
      return badRequest(res, `Invalid fields: ${invalidFields.join(', ')}`);
    }

    const [existing] = await pool.execute(
      'SELECT id FROM templates WHERE name = ? AND organization_id = ?',
      [name.trim(), organizationId]
    );
    if ((existing as any[]).length > 0) {
      return res.status(409).json({ error: 'Template name already exists' });
    }

    const [result] = await pool.execute(
      `INSERT INTO templates (name, organization_id, card_size, orientation, is_double_sided,
         background_color, text_color, background_image_url, fields)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        organizationId,
        cardSize,
        orientation,
        isDoubleSided ? 1 : 0,
        backgroundColor,
        textColor,
        backgroundImageUrl || null,
        JSON.stringify(fields) // Store with prefixes
      ]
    );

    const templateId = (result as any).insertId;
    res.status(201).json({ 
      success: true, 
      message: 'Template created successfully', 
      templateId,
      data: {
        id: templateId,
        name: name.trim(),
        card_size: cardSize,
        orientation,
        is_double_sided: isDoubleSided ? 1 : 0,
        background_color: backgroundColor,
        text_color: textColor,
        background_image_url: backgroundImageUrl || null,
        fields,
        ...parseFieldsToSides(fields) // Include parsed front/back for convenience
      }
    });

  } catch (error: any) {
    console.error('🔥 MYSQL ERROR (create template):', error?.sqlMessage ?? error?.message ?? error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ================================
 * GET ALL TEMPLATES
 * ================================
 */
router.get('/', authenticateToken, requireRole(['admin', 'staff']), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user?.organization_id;
    if (!organizationId) {
      return res.status(400).json({ error: 'You are not assigned to any organization.' });
    }

    const [templates] = await pool.execute(
      `SELECT t.*, o.name as organization_name
       FROM templates t
       LEFT JOIN organizations o ON t.organization_id = o.id
       WHERE t.organization_id = ?
       ORDER BY t.created_at DESC`,
      [organizationId]
    );

    const parsed = (templates as any[]).map(t => {
      const parsedFields = safeParse(t.fields);
      if (!parsedFields || !Array.isArray(parsedFields)) {
        console.error("Invalid JSON in DB for template:", t.id);
        return { ...t, fields: [], front_fields: [], back_fields: [] };
      }
      
      // Parse fields into front/back for easier frontend use
      const { frontFields, backFields } = parseFieldsToSides(parsedFields);
      
      return { 
        ...t, 
        fields: parsedFields,
        front_fields: frontFields,
        back_fields: backFields
      };
    });

    res.json({ 
      success: true, 
      data: parsed, // Changed from "templates" to "data" to match frontend
      count: parsed.length 
    });

  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ================================
 * GET TEMPLATE BY ID
 * ================================
 */
router.get('/:id', authenticateToken, requireRole(['admin', 'staff']), async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.id;
    const organizationId = req.user.organization_id;

    const [templates] = await pool.execute(
      `SELECT * FROM templates WHERE id = ? AND organization_id = ?`,
      [templateId, organizationId]
    );

    if ((templates as any[]).length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = (templates as any[])[0];
    const parsedFields = safeParse(template.fields) ?? [];
    
    // Parse fields into front/back for easier frontend use
    const { frontFields, backFields } = parseFieldsToSides(parsedFields);

    res.json({ 
      success: true, 
      data: { 
        ...template, 
        fields: parsedFields,
        front_fields: frontFields,
        back_fields: backFields
      }
    });

  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ================================
 * UPDATE TEMPLATE
 * ================================
 */
router.put('/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.id;
    const organizationId = req.user.organization_id;

    const {
      name,
      cardSize,
      orientation,
      isDoubleSided,
      backgroundColor,
      textColor,
      backgroundImageUrl,
      fields
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'You are not assigned to any organization.' });
    }

    if (fields && !Array.isArray(fields)) {
      return badRequest(res, 'fields must be an array');
    }

    // UPDATED VALIDATION: Strip prefixes before checking
    if (fields && fields.length > 0) {
      const invalidFields = fields.filter((f: any) => {
        if (typeof f !== 'string') return true;
        
        // Remove front: or back: prefixes before validation
        const cleanField = cleanFieldForValidation(f);
        return !AVAILABLE_FIELDS.includes(cleanField);
      });

      if (invalidFields.length > 0) {
        return badRequest(res, `Invalid fields: ${invalidFields.join(', ')}`);
      }
    }

    await pool.execute(
      `UPDATE templates
       SET name = ?, card_size = ?, orientation = ?, is_double_sided = ?,
           background_color = ?, text_color = ?, background_image_url = ?, fields = ?
       WHERE id = ? AND organization_id = ?`,
      [
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
      ]
    );

    // Get updated template to return
    const [updatedTemplates] = await pool.execute(
      `SELECT * FROM templates WHERE id = ? AND organization_id = ?`,
      [templateId, organizationId]
    );

    const updatedTemplate = (updatedTemplates as any[])[0];
    const parsedFields = safeParse(updatedTemplate.fields) ?? [];
    const { frontFields, backFields } = parseFieldsToSides(parsedFields);

    res.json({ 
      success: true, 
      message: 'Template updated successfully',
      data: {
        ...updatedTemplate,
        fields: parsedFields,
        front_fields: frontFields,
        back_fields: backFields
      }
    });

  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ================================
 * DELETE TEMPLATE
 * ================================
 */
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.id;
    const organizationId = req.user.organization_id;

    await pool.execute(
      'DELETE FROM templates WHERE id = ? AND organization_id = ?',
      [templateId, organizationId]
    );

    res.json({ success: true, message: 'Template deleted successfully' });

  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Available fields */
router.get('/options/available-fields', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ 
    success: true,
    data: AVAILABLE_FIELDS.map(field => ({
      id: field,
      label: field.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' '),
      type: field === 'photo' ? 'image' : 
            field === 'dob' || field === 'issue_date' || field === 'expiry_date' ? 'date' :
            field === 'mobile' ? 'phone' :
            field === 'email' ? 'email' : 'text'
    }))
  });
});

export default router;