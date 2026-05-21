import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from '../types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication token required',
      });
    }

    // Verify JWT
    const decoded = await request.jwtVerify<JWTPayload>();
    request.user = decoded;
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

// Role-based access control
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // First authenticate
    await authMiddleware(request, reply);
    
    if (reply.sent) return;

    const userRole = request.user?.role;
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden',
        message: `This action requires one of these roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

// Shortcuts for common role checks
// Roller: ADMIN > OPERATOR > VIEWER
export const requireAdmin = requireRole('ADMIN');
export const requireOperator = requireRole('ADMIN', 'OPERATOR');
export const requireViewer = requireRole('ADMIN', 'OPERATOR', 'VIEWER'); // Tüm authenticated kullanıcılar

// Type for authenticated requests
export interface AuthenticatedRequest<T = unknown> extends FastifyRequest<T> {
  user: JWTPayload;
}
