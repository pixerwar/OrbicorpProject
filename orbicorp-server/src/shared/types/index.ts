import { FastifyRequest, FastifyReply } from 'fastify';

// JWT Payload
export interface JWTPayload {
  userId: string;
  companyId: string;
  email: string;
  role: string;
}

// Authenticated Request
export interface AuthenticatedRequest extends FastifyRequest {
  user: JWTPayload;
}

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Common filters
export interface BaseFilters {
  search?: string;
  status?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

// Route handler type
export type RouteHandler<T = unknown> = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<ApiResponse<T>>;

// Authenticated route handler
export type AuthRouteHandler<T = unknown> = (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => Promise<ApiResponse<T>>;
