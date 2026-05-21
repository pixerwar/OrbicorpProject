import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import { loginSchema, registerSchema, refreshTokenSchema, LoginInput, RegisterInput, RefreshTokenInput } from './auth.schema.js';
import { authMiddleware } from '../../shared/middleware/auth.js';
import { JWTPayload } from '../../shared/types/index.js';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerSchema.parse(request.body);
      const user = await authService.register(body);

      // Generate tokens
      const accessToken = app.jwt.sign(
        {
          userId: user.userId,
          companyId: user.companyId,
          email: user.email,
          role: user.role,
        } as JWTPayload
      );
      const refreshToken = await authService.createRefreshToken(user.userId);

      return reply.status(201).send({
        success: true,
        data: {
          user,
          accessToken,
          refreshToken,
        },
        message: 'Registration successful',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/auth/login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);
      const user = await authService.login(body);

      // Generate tokens
      const accessToken = app.jwt.sign(
        {
          userId: user.userId,
          companyId: user.companyId,
          email: user.email,
          role: user.role,
        } as JWTPayload
      );
      const refreshToken = await authService.createRefreshToken(user.userId);

      return reply.send({
        success: true,
        data: {
          user,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message,
      });
    }
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshTokenSchema.parse(request.body);
      const payload = await authService.verifyRefreshToken(body.refreshToken);

      // Revoke old refresh token
      await authService.revokeRefreshToken(body.refreshToken);

      // Generate new tokens
      const accessToken = app.jwt.sign(payload as JWTPayload);
      const refreshToken = await authService.createRefreshToken(payload.userId);

      return reply.send({
        success: true,
        data: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message,
      });
    }
  });

  // POST /api/v1/auth/logout
  app.post('/logout', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { refreshToken?: string };
      
      if (body.refreshToken) {
        await authService.revokeRefreshToken(body.refreshToken);
      }

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Logout failed',
      });
    }
  });

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: [authMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await authService.getUserById(request.user!.userId);

      return reply.send({
        success: true,
        data: user,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get user';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });
}
