import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { agentsService } from './agents.service.js';
import { createAgentSchema, updateAgentSchema, listAgentsQuery } from './agents.schema.js';
import { authMiddleware, requireOperator } from '../../shared/middleware/auth.js';

export async function agentsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/agents/main - Get Main Agent for company
  app.get('/main', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agent = await agentsService.getMainAgent(request.user!.companyId);

      return reply.send({
        success: true,
        data: agent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Main agent not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // GET /api/v1/agents - List agents
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listAgentsQuery.parse(request.query);
      const result = await agentsService.list(request.user!.companyId, query);

      return reply.send({
        success: true,
        data: result.agents,
        meta: result.meta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list agents';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/agents/:id - Get single agent
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const agent = await agentsService.getById(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: agent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // POST /api/v1/agents - Create agent (requires operator+)
  app.post('/', { preHandler: [requireOperator] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createAgentSchema.parse(request.body);
      const agent = await agentsService.create(request.user!.companyId, body);

      return reply.status(201).send({
        success: true,
        data: agent,
        message: 'Agent created successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create agent';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/agents/:id - Update agent (requires operator+)
  app.put('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      console.log('Update agent request:', {
        id: request.params.id,
        body: request.body,
        userId: request.user?.userId
      });
      
      const body = updateAgentSchema.parse(request.body);
      console.log('Parsed body:', body);
      
      const agent = await agentsService.update(request.params.id, request.user!.companyId, body);
      console.log('Updated agent systemPrompt:', agent.systemPrompt?.substring(0, 50));

      return reply.send({
        success: true,
        data: agent,
        message: 'Agent updated successfully',
      });
    } catch (error) {
      console.error('Update agent error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update agent';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // DELETE /api/v1/agents/:id - Delete agent (requires manager+)
  app.delete('/:id', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await agentsService.delete(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        message: 'Agent deleted successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete agent';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/agents/:id/pause - Pause agent
  app.post('/:id/pause', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const agent = await agentsService.pause(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: agent,
        message: 'Agent paused',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause agent';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/agents/:id/resume - Resume agent
  app.post('/:id/resume', { preHandler: [requireOperator] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const agent = await agentsService.resume(request.params.id, request.user!.companyId);

      return reply.send({
        success: true,
        data: agent,
        message: 'Agent resumed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume agent';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/agents/:id/stats - Get agent stats
  app.get('/:id/stats', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const stats = await agentsService.getStats(request.params.id, request.user!.companyId);

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
}
