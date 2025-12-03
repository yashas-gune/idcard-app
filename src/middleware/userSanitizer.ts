import { Request, Response, NextFunction } from 'express';
import { AuthRequest, JWTUser } from './auth';

/**
 * Middleware to ensure user data is consistent and has default values
 * Runs on every request before reaching the route handler
 */
export const sanitizeUserData = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user) {
    // Set defaults for missing required fields
    const user = req.user;
    
    // Ensure department is never undefined/null
    if (!user.department && user.role === 'staff') {
      // Cast to any to bypass TypeScript strictness or extend interface
      (user as any).department = 'General';
      console.log(`🛠 Sanitized user ${user.id}: set department to "General"`);
    }
    
    // Ensure organization_id is set for non-owner users
    if (!user.organization_id && user.role !== 'owner') {
      console.warn(`⚠️ User ${user.id} (${user.role}) has no organization_id`);
      // You might want to handle this differently based on your business logic
    }
    
    // Log sanitization for debugging
    console.log('🔧 User data sanitized:', { 
      id: user.id, 
      role: user.role, 
      department: user.department 
    });
  }
  next();
};

/**
 * More aggressive sanitizer that ensures ALL users have consistent data
 */
export const strictUserSanitizer = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user) {
    const defaults: Record<string, any> = {
      department: 'General',
      // Add other defaults as needed based on role
    };
    
    Object.keys(defaults).forEach(key => {
      const currentValue = (req.user as any)[key];
      const defaultValue = defaults[key];
      
      if (currentValue === undefined || currentValue === null || currentValue === '') {
        (req.user as any)[key] = defaultValue;
        console.log(`🛠 Strict sanitizer: set ${key} to "${defaultValue}" for user ${req.user!.id}`);
      }
    });
  }
  next();
};