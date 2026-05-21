import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cardsService } from './cards.service.js';
import {
  createCardSchema,
  updateCardSchema,
  assignCardSchema,
  createTransactionSchema,
  listCardsQuery,
  listTransactionsQuery,
} from './cards.schema.js';
import { authMiddleware, requireOperator } from '../../shared/middleware/auth.js';

export async function cardsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // ═══════════════════════════════════════════
  // CARD CRUD
  // ═══════════════════════════════════════════

  // GET /api/v1/cards - List all cards
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listCardsQuery.parse(request.query);
      const result = await cardsService.list(request.user!.companyId, query);
      return reply.send({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kartlar yüklenemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // GET /api/v1/cards/:id - Get single card
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const card = await cardsService.getById(request.params.id, request.user!.companyId);
      return reply.send({ success: true, data: card });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart bulunamadı';
      return reply.status(404).send({ success: false, error: 'Not Found', message });
    }
  });

  // POST /api/v1/cards - Create new card (requires operator)
  app.post('/', { preHandler: requireOperator }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = createCardSchema.parse(request.body);
      const card = await cardsService.create(request.user!.companyId, input);
      return reply.status(201).send({ success: true, data: card });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart oluşturulamadı';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // PUT /api/v1/cards/:id - Update card
  app.put('/:id', { preHandler: requireOperator }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const input = updateCardSchema.parse(request.body);
      const card = await cardsService.update(request.params.id, request.user!.companyId, input);
      return reply.send({ success: true, data: card });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart güncellenemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // DELETE /api/v1/cards/:id - Delete card
  app.delete('/:id', { preHandler: requireOperator }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await cardsService.delete(request.params.id, request.user!.companyId);
      return reply.send({ success: true, message: 'Kart silindi' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart silinemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // POST /api/v1/cards/:id/freeze - Freeze card
  app.post('/:id/freeze', { preHandler: requireOperator }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const card = await cardsService.freeze(request.params.id, request.user!.companyId);
      return reply.send({ success: true, data: card, message: 'Kart donduruldu' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart dondurulamadı';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // POST /api/v1/cards/:id/unfreeze - Unfreeze card
  app.post('/:id/unfreeze', { preHandler: requireOperator }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const card = await cardsService.unfreeze(request.params.id, request.user!.companyId);
      return reply.send({ success: true, data: card, message: 'Kart aktif edildi' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart aktif edilemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // ═══════════════════════════════════════════
  // AGENT CARD ASSIGNMENT
  // ═══════════════════════════════════════════

  // POST /api/v1/cards/assign - Assign card to agent
  app.post('/assign', { preHandler: requireOperator }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = assignCardSchema.parse(request.body);
      const result = await cardsService.assignToAgent(request.user!.companyId, input);
      return reply.status(201).send({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart atanamadı';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // DELETE /api/v1/cards/assign/:agentId/:cardId - Remove card from agent
  app.delete('/assign/:agentId/:cardId', { preHandler: requireOperator }, async (
    request: FastifyRequest<{ Params: { agentId: string; cardId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      await cardsService.removeFromAgent(
        request.user!.companyId,
        request.params.agentId,
        request.params.cardId
      );
      return reply.send({ success: true, message: 'Kart agent\'tan kaldırıldı' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kart kaldırılamadı';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // GET /api/v1/cards/agent/:agentId - Get agent's cards
  app.get('/agent/:agentId', async (
    request: FastifyRequest<{ Params: { agentId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const cards = await cardsService.getAgentCards(request.params.agentId, request.user!.companyId);
      return reply.send({ success: true, data: cards });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kartlar yüklenemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // ═══════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════

  // GET /api/v1/cards/transactions - List transactions
  app.get('/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listTransactionsQuery.parse(request.query);
      const result = await cardsService.listTransactions(request.user!.companyId, query);
      return reply.send({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İşlemler yüklenemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // GET /api/v1/cards/transactions/pending - Get pending transactions
  app.get('/transactions/pending', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const transactions = await cardsService.getPendingTransactions(request.user!.companyId);
      return reply.send({ success: true, data: transactions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İşlemler yüklenemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // POST /api/v1/cards/transactions/:id/approve - Approve transaction
  app.post('/transactions/:id/approve', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const transaction = await cardsService.approveTransaction(
        request.params.id,
        request.user!.companyId,
        request.user!.userId
      );
      return reply.send({ success: true, data: transaction, message: 'İşlem onaylandı' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İşlem onaylanamadı';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // POST /api/v1/cards/transactions/:id/reject - Reject transaction
  app.post('/transactions/:id/reject', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const transaction = await cardsService.rejectTransaction(
        request.params.id,
        request.user!.companyId
      );
      return reply.send({ success: true, data: transaction, message: 'İşlem reddedildi' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İşlem reddedilemedi';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });

  // POST /api/v1/cards/transactions/:id/complete - Complete transaction
  app.post('/transactions/:id/complete', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const transaction = await cardsService.completeTransaction(
        request.params.id,
        request.user!.companyId
      );
      return reply.send({ success: true, data: transaction, message: 'İşlem tamamlandı' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İşlem tamamlanamadı';
      return reply.status(400).send({ success: false, error: 'Bad Request', message });
    }
  });
}
