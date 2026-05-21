import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { notificationsService } from './notifications.service.js';
import { RespondNotificationSchema } from './notifications.schema.js';
import { authMiddleware } from '../../shared/middleware/auth.js';

export async function notificationsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /notifications - List notifications for current user
  app.get('/', async (request: FastifyRequest<{ Querystring: { status?: string; type?: string; limit?: string } }>, reply: FastifyReply) => {
    try {
      const { status, type, limit } = request.query;
      
      const result = await notificationsService.listForUser(request.user!.id, {
        status,
        type,
        limit: limit ? parseInt(limit) : 20,
      });
      
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list notifications';
      return reply.status(500).send({ error: message });
    }
  });

  // GET /notifications/pending - Get pending approvals
  app.get('/pending', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await notificationsService.getPendingApprovals(request.user!.id);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get pending approvals';
      return reply.status(500).send({ error: message });
    }
  });

  // GET /notifications/count - Count pending approvals (for badge)
  app.get('/count', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const count = await notificationsService.countPendingApprovals(request.user!.id);
      return reply.send({ count });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to count notifications';
      return reply.status(500).send({ error: message });
    }
  });

  // GET /notifications/:id - Get single notification
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const notification = await notificationsService.get(request.user!.id, id);
      
      if (!notification) {
        return reply.status(404).send({ error: 'Bildirim bulunamadı' });
      }
      
      return reply.send(notification);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get notification';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /notifications/:id/read - Mark as read
  app.post('/:id/read', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const notification = await notificationsService.markAsRead(request.user!.id, id);
      
      if (!notification) {
        return reply.status(404).send({ error: 'Bildirim bulunamadı' });
      }
      
      return reply.send(notification);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark as read';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /notifications/read-all - Mark all as read
  app.post('/read-all', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await notificationsService.markAllAsRead(request.user!.id);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark all as read';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /notifications/:id/respond - Respond to approval
  app.post('/:id/respond', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      const parsed = RespondNotificationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Geçersiz veri', details: parsed.error.errors });
      }
      
      const result = await notificationsService.respond(request.user!.id, id, parsed.data);
      
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to respond';
      return reply.status(500).send({ error: message });
    }
  });
}
