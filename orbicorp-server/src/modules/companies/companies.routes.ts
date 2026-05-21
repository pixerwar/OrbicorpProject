import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { companiesService } from './companies.service.js';
import { updateCompanySchema, updateBrandingSchema } from './companies.schema.js';
import { authMiddleware, requireAdmin } from '../../shared/middleware/auth.js';

export async function companiesRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/company - Get current company
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const company = await companiesService.getById(request.user!.companyId);

      return reply.send({
        success: true,
        data: company,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Company not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // PUT /api/v1/company - Update company (admin only)
  app.put('/', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = updateCompanySchema.parse(request.body);
      const company = await companiesService.update(request.user!.companyId, body);

      return reply.send({
        success: true,
        data: company,
        message: 'Company updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update company';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/company/branding - Update branding (admin only)
  app.put('/branding', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = updateBrandingSchema.parse(request.body);
      const company = await companiesService.updateBranding(request.user!.companyId, body);

      return reply.send({
        success: true,
        data: company,
        message: 'Branding updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update branding';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/company/stats - Get dashboard stats
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await companiesService.getDashboardStats(request.user!.companyId);

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

  // GET /api/v1/company/llm-config - Get LLM configuration status
  app.get('/llm-config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await companiesService.getLLMConfig(request.user!.companyId);

      return reply.send({
        success: true,
        data: config,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get LLM config';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/v1/company/llm-config - Update LLM configuration (admin only)
  app.put('/llm-config', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { provider: string; apiKey: string };
      const config = await companiesService.updateLLMConfig(request.user!.companyId, body.provider, body.apiKey);

      return reply.send({
        success: true,
        data: config,
        message: 'LLM configuration updated',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update LLM config';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // DELETE /api/v1/company/llm-config/:provider - Remove LLM provider (admin only)
  app.delete('/llm-config/:provider', { preHandler: [requireAdmin] }, async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
    try {
      const config = await companiesService.removeLLMConfig(request.user!.companyId, request.params.provider);

      return reply.send({
        success: true,
        data: config,
        message: 'LLM provider removed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove LLM config';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });
}
