import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { channelsService } from './channels.service.js';
import { CreateChannelSchema, UpdateChannelSchema } from './channels.schema.js';
import { authMiddleware, requireAdmin } from '../../shared/middleware/auth.js';

export async function channelsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /channels - List all channels
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await channelsService.list(request.user!.companyId);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list channels';
      return reply.status(500).send({ error: message });
    }
  });

  // GET /channels/dropdown - List channels for dropdown (active only, minimal info)
  app.get('/dropdown', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await channelsService.listForDropdown(request.user!.companyId);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list channels';
      return reply.status(500).send({ error: message });
    }
  });

  // GET /channels/:id - Get single channel
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const channel = await channelsService.get(request.user!.companyId, id);
      
      if (!channel) {
        return reply.status(404).send({ error: 'Kanal bulunamadı' });
      }
      
      return reply.send(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get channel';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /channels - Create new channel (admin only)
  app.post('/', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = CreateChannelSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Geçersiz veri', details: parsed.error.errors });
      }
      
      const channel = await channelsService.create(request.user!.companyId, parsed.data);
      return reply.status(201).send(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create channel';
      return reply.status(500).send({ error: message });
    }
  });

  // PUT /channels/:id - Update channel (admin only)
  app.put('/:id', { preHandler: requireAdmin }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const parsed = UpdateChannelSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Geçersiz veri', details: parsed.error.errors });
      }
      
      const channel = await channelsService.update(request.user!.companyId, id, parsed.data);
      
      if (!channel) {
        return reply.status(404).send({ error: 'Kanal bulunamadı' });
      }
      
      return reply.send(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update channel';
      return reply.status(500).send({ error: message });
    }
  });

  // DELETE /channels/:id - Delete channel (admin only)
  app.delete('/:id', { preHandler: requireAdmin }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const deleted = await channelsService.delete(request.user!.companyId, id);
      
      if (!deleted) {
        return reply.status(404).send({ error: 'Kanal bulunamadı' });
      }
      
      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete channel';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /channels/:id/test - Test channel connection (admin only)
  app.post('/:id/test', { preHandler: requireAdmin }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const result = await channelsService.test(request.user!.companyId, id);
      
      // If successful, mark as active
      if (result.success) {
        await channelsService.markAsActive(request.user!.companyId, id);
      }
      
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to test channel';
      return reply.status(500).send({ error: message });
    }
  });
}
