import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { usersService } from './users.service.js';
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  resetPasswordSchema,
  listUsersQuery,
} from './users.schema.js';
import { authMiddleware, requireAdmin, requireOperator } from '../../shared/middleware/auth.js';

export async function usersRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/users - List users (operator+)
  app.get('/', { preHandler: [requireOperator] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listUsersQuery.parse(request.query);
      const result = await usersService.list(request.user!.companyId, query);

      return reply.send({
        success: true,
        data: result.users,
        meta: result.meta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list users';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/users/stats - Get user stats (operator+)
  app.get('/stats', { preHandler: [requireOperator] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await usersService.getStats(request.user!.companyId);

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get stats';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/users/departments - Get departments list
  app.get('/departments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const departments = usersService.getDepartments();

      return reply.send({
        success: true,
        data: departments,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get departments';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/users/:id - Get user details (operator+)
  app.get('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = await usersService.getById(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: user,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'User not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // POST /api/v1/users - Create user (admin only)
  app.post('/', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createUserSchema.parse(request.body);
      const user = await usersService.create(request.user!.companyId, body);

      return reply.status(201).send({
        success: true,
        data: user,
        message: 'User created successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create user';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/users/:id - Update user (operator for self, admin for others)
  app.put('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = updateUserSchema.parse(request.body);
      
      // Operators can only update themselves
      if (request.user!.role === 'OPERATOR' && request.params.id !== request.user!.userId) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: 'You can only update your own profile',
        });
      }

      const user = await usersService.update(
        request.params.id,
        request.user!.companyId,
        body,
        request.user!.userId,
        request.user!.role
      );

      return reply.send({
        success: true,
        data: user,
        message: 'User updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // DELETE /api/v1/users/:id - Delete user (admin only)
  app.delete('/:id', { preHandler: [requireAdmin] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await usersService.delete(
        request.params.id,
        request.user!.companyId,
        request.user!.userId
      );

      return reply.send({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete user';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/users/change-password - Change own password
  app.post('/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = changePasswordSchema.parse(request.body);
      await usersService.changePassword(request.user!.userId, body);

      return reply.send({
        success: true,
        message: 'Password changed successfully. Please login again.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/users/:id/reset-password - Admin resets user password
  app.post('/:id/reset-password', { preHandler: [requireAdmin] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = resetPasswordSchema.parse(request.body);
      await usersService.resetPassword(
        request.params.id,
        request.user!.companyId,
        body
      );

      return reply.send({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset password';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });
}
