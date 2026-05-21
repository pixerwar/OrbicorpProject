import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { workflowsService } from './workflows.service.js';
import { createWorkflowSchema, updateWorkflowSchema, listWorkflowsQuery } from './workflows.schema.js';
import { authMiddleware, requireOperator } from '../../shared/middleware/auth.js';

export async function workflowsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/workflows - List workflows
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listWorkflowsQuery.parse(request.query);
      const result = await workflowsService.list(request.user!.companyId, query);

      return reply.send({
        success: true,
        data: result.workflows,
        meta: result.meta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list workflows';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/workflows/stats - Get workflow stats
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await workflowsService.getStats(request.user!.companyId);

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

  // GET /api/v1/workflows/:id - Get single workflow
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const workflow = await workflowsService.getById(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: workflow,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // POST /api/v1/workflows - Create workflow (requires operator+)
  app.post('/', { preHandler: [requireOperator] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createWorkflowSchema.parse(request.body);
      const workflow = await workflowsService.create(request.user!.companyId, body);

      return reply.status(201).send({
        success: true,
        data: workflow,
        message: 'Workflow created successfully',
      });
    } catch (error) {
      console.error('Create workflow error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create workflow';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/workflows/:id - Update workflow (requires operator+)
  app.put('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = updateWorkflowSchema.parse(request.body);
      const workflow = await workflowsService.update(request.params.id, request.user!.companyId, body);

      return reply.send({
        success: true,
        data: workflow,
        message: 'Workflow updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update workflow';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // DELETE /api/v1/workflows/:id - Delete workflow (requires operator+)
  app.delete('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await workflowsService.delete(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        message: 'Workflow deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete workflow';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/workflows/:id/activate - Activate workflow
  app.post('/:id/activate', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const workflow = await workflowsService.activate(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: workflow,
        message: 'Workflow activated',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to activate workflow';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/workflows/:id/pause - Pause workflow
  app.post('/:id/pause', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const workflow = await workflowsService.pause(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: workflow,
        message: 'Workflow paused',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause workflow';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/workflows/:id/run - Run workflow manually
  app.post('/:id/run', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string }; Body: { triggerData?: any } }>, reply: FastifyReply) => {
    try {
      const { triggerData } = (request.body || {}) as { triggerData?: any };
      const task = await workflowsService.run(request.params.id, request.user!.companyId, triggerData);

      return reply.send({
        success: true,
        data: task,
        message: 'Workflow started',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run workflow';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });
}
