/**
 * Service layer for user data consistency and business logic
 * Use this when you need guaranteed consistent user data
 */

export interface SafeUser {
    id: number;
    mobile: string;
    role: string;
    organization_id?: number;
    department: string;
    name: string;
    // Add any computed fields
    canCreateTemplates: boolean;
    canManageUsers: boolean;
    maxIdCards: number;
  }
  
  /**
   * Returns a user object with guaranteed default values
   */
  export const getUserWithDefaults = (user: any): SafeUser => {
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
  
  /**
   * Get user data specifically for ID card operations
   */
  export const getUserForIdCardOperations = (user: any) => {
    const safeUser = getUserWithDefaults(user);
    
    // Add ID-card specific logic
    return {
      ...safeUser,
      allowedTemplates: getAllowedTemplates(user.role),
      canExportIds: user.role !== 'staff',
    };
  };
  
  /**
   * Get user data specifically for template operations
   */
  export const getUserForTemplateOperations = (user: any) => {
    const safeUser = getUserWithDefaults(user);
    
    return {
      ...safeUser,
      canEditTemplates: user.role === 'admin' || user.role === 'owner',
      canDeleteTemplates: user.role === 'owner',
    };
  };
  
  // Helper functions
  const getDefaultDepartment = (role: string): string => {
    const defaults = {
      staff: 'General',
      admin: 'Administration', 
      owner: 'Management'
    };
    return defaults[role] || 'General';
  };
  
  const getMaxIdCards = (role: string): number => {
    const limits = {
      staff: 100,
      admin: 1000,
      owner: 10000
    };
    return limits[role] || 100;
  };
  
  const getAllowedTemplates = (role: string): string[] => {
    if (role === 'owner') return ['all'];
    if (role === 'admin') return ['standard', 'premium'];
    return ['standard'];
  };