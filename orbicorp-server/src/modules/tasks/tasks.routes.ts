import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tasksService } from './tasks.service.js';
import { createTaskSchema, updateTaskSchema, listTasksQuery, addTaskLogSchema, updateTaskStepSchema } from './tasks.schema.js';
import { authMiddleware, requireOperator } from '../../shared/middleware/auth.js';

export async function tasksRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/tasks - List tasks
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listTasksQuery.parse(request.query);
      const result = await tasksService.list(request.user!.companyId, query);

      return reply.send({
        success: true,
        data: result.tasks,
        meta: result.meta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list tasks';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/tasks/stats - Get task stats
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await tasksService.getStats(request.user!.companyId);

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

  // GET /api/v1/tasks/:id - Get single task
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const task = await tasksService.getById(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: task,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Task not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // POST /api/v1/tasks - Create task
  app.post('/', { preHandler: [requireOperator] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createTaskSchema.parse(request.body);
      const task = await tasksService.create(request.user!.companyId, body);

      return reply.status(201).send({
        success: true,
        data: task,
        message: 'Task created successfully',
      });
    } catch (error) {
      console.error('Create task error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create task';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/tasks/:id - Update task
  app.put('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = updateTaskSchema.parse(request.body);
      const task = await tasksService.update(request.params.id, request.user!.companyId, body);

      return reply.send({
        success: true,
        data: task,
        message: 'Task updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update task';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // DELETE /api/v1/tasks/:id - Delete task
  app.delete('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await tasksService.delete(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        message: 'Task deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete task';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/tasks/:id/start - Start task
  app.post('/:id/start', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const task = await tasksService.start(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: task,
        message: 'Task started',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start task';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/tasks/:id/cancel - Cancel task
  app.post('/:id/cancel', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const task = await tasksService.cancel(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: task,
        message: 'Task cancelled',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel task';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/tasks/:id/approve - Approve/reject task step
  app.post('/:id/approve', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string }; Body: { stepId: number; approved: boolean } }>, reply: FastifyReply) => {
    try {
      const { stepId, approved } = request.body as { stepId: number; approved: boolean };
      const task = await tasksService.approve(request.params.id, request.user!.companyId, stepId, approved);

      return reply.send({
        success: true,
        data: task,
        message: approved ? 'Step approved' : 'Step rejected',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve task';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/tasks/:id/log - Add log entry
  app.post('/:id/log', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = addTaskLogSchema.parse(request.body);
      await tasksService.addLog(request.params.id, request.user!.companyId, body);

      return reply.send({
        success: true,
        message: 'Log added',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add log';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/tasks/:id/step - Update task step
  app.put('/:id/step', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = updateTaskStepSchema.parse(request.body);
      await tasksService.updateStep(request.params.id, request.user!.companyId, body);

      return reply.send({
        success: true,
        message: 'Step updated',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update step';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });
}
