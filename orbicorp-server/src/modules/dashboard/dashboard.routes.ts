import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dashboardService } from './dashboard.service.js';
import { authMiddleware } from '../../shared/middleware/auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /dashboard/stats - Get dashboard statistics
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('Dashboard stats request, companyId:', request.user?.companyId);
      const stats = await dashboardService.getStats(request.user!.companyId);
      console.log('Dashboard stats success');
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Dashboard stats ERROR:', error);
      const message = error instanceof Error ? error.message : 'Failed to get dashboard stats';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  // GET /dashboard/activity - Get activity chart data
  app.get('/activity', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await dashboardService.getActivityChart(request.user!.companyId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get activity data';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  // GET /dashboard/top-agents - Get top performing agents
  app.get('/top-agents', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    try {
      const limit = request.query.limit ? parseInt(request.query.limit) : 5;
      const data = await dashboardService.getTopAgents(request.user!.companyId, limit);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get top agents';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  // GET /dashboard/model-usage - Get model usage breakdown
  app.get('/model-usage', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await dashboardService.getModelUsage(request.user!.companyId);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get model usage';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
}
