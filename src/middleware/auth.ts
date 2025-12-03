import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Define the User interface based on your JWT payload
export interface JWTUser {
  id: number;
  mobile: string;
  role: 'owner' | 'agent' | 'admin' | 'staff';
  organization_id?: number | null;
  iat?: number;
  exp?: number;
}

// Extend Express Request interface
export interface AuthRequest extends Request {
  user?: JWTUser;
}

// Keep your existing authenticateToken function with proper typing
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET!, (err: jwt.VerifyErrors | null, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    console.log('Decoded JWT payload:', decoded);
    
    // Type cast the decoded payload to JWTUser
    req.user = decoded as JWTUser;
    next();
  });
};

// Keep your existing requireRole function with proper typing
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

// Additional helper middleware (optional - keep if you need it)

// Middleware to check if user is owner
export const requireOwner = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
};

// Middleware to check if user is agent or owner
export const requireAgentOrOwner = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !['owner', 'agent'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Agent or owner access required' });
  }
  next();
};

// Middleware to check if user is admin, agent, or owner
export const requireAdminOrAbove = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !['owner', 'agent', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin or higher access required' });
  }
  next();
};

// Middleware to get user ID safely
export const getUserId = (req: AuthRequest): number | null => {
  return req.user?.id || null;
};

// Middleware to get user role safely
export const getUserRole = (req: AuthRequest): string | null => {
  return req.user?.role || null;
};