"use strict";
/**
 * Service layer for user data consistency and business logic
 * Use this when you need guaranteed consistent user data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserForTemplateOperations = exports.getUserForIdCardOperations = exports.getUserWithDefaults = void 0;
/**
 * Returns a user object with guaranteed default values
 */
const getUserWithDefaults = (user) => {
    const safeUser = {
        ...user,
        // Ensure critical fields have values
        department: user.department || getDefaultDepartment(user.role),
        organization_id: user.organization_id || 0,
        // Add computed fields for business logic
        canCreateTemplates: user.role === 'admin' || user.role === 'owner',
        canManageUsers: user.role === 'owner',
        maxIdCards: getMaxIdCards(user.role),
    };
    return safeUser;
};
exports.getUserWithDefaults = getUserWithDefaults;
/**
 * Get user data specifically for ID card operations
 */
const getUserForIdCardOperations = (user) => {
    const safeUser = (0, exports.getUserWithDefaults)(user);
    // Add ID-card specific logic
    return {
        ...safeUser,
        allowedTemplates: getAllowedTemplates(user.role),
        canExportIds: user.role !== 'staff',
    };
};
exports.getUserForIdCardOperations = getUserForIdCardOperations;
/**
 * Get user data specifically for template operations
 */
const getUserForTemplateOperations = (user) => {
    const safeUser = (0, exports.getUserWithDefaults)(user);
    return {
        ...safeUser,
        canEditTemplates: user.role === 'admin' || user.role === 'owner',
        canDeleteTemplates: user.role === 'owner',
    };
};
exports.getUserForTemplateOperations = getUserForTemplateOperations;
// Helper functions
const getDefaultDepartment = (role) => {
    const defaults = {
        staff: 'General',
        admin: 'Administration',
        owner: 'Management'
    };
    return defaults[role] || 'General';
};
const getMaxIdCards = (role) => {
    const limits = {
        staff: 100,
        admin: 1000,
        owner: 10000
    };
    return limits[role] || 100;
};
const getAllowedTemplates = (role) => {
    if (role === 'owner')
        return ['all'];
    if (role === 'admin')
        return ['standard', 'premium'];
    return ['standard'];
};
