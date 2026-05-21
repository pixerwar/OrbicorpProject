import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sessionsService } from './sessions.service.js';
import {
  createSessionSchema,
  sendMessageSchema,
  listSessionsQuery,
  listMessagesQuery,
} from './sessions.schema.js';
import { authMiddleware } from '../../shared/middleware/auth.js';

export async function sessionsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/sessions - List user's sessions
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listSessionsQuery.parse(request.query);
      const result = await sessionsService.list(
        request.user!.userId,
        request.user!.companyId,
        query
      );

      return reply.send({
        success: true,
        data: result.sessions,
        meta: result.meta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list sessions';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/sessions - Create new session
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createSessionSchema.parse(request.body);
      const session = await sessionsService.create(
        request.user!.userId,
        request.user!.companyId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: session,
        message: 'Session created',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/sessions/:id - Get session details
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const session = await sessionsService.getById(
        request.params.id,
        request.user!.userId
      );

      return reply.send({
        success: true,
        data: session,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session not found';
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message,
      });
    }
  });

  // POST /api/v1/sessions/:id/end - End session
  app.post('/:id/end', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const session = await sessionsService.end(
        request.params.id,
        request.user!.userId
      );

      return reply.send({
        success: true,
        data: session,
        message: 'Session ended',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end session';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // DELETE /api/v1/sessions/:id - Delete session
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await sessionsService.delete(
        request.params.id,
        request.user!.userId
      );

      return reply.send({
        success: true,
        message: 'Session deleted',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete session';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/sessions/:id/messages - Get messages
  app.get('/:id/messages', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const query = listMessagesQuery.parse(request.query);
      const messages = await sessionsService.getMessages(
        request.params.id,
        request.user!.userId,
        query
      );

      return reply.send({
        success: true,
        data: messages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get messages';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // POST /api/v1/sessions/:id/messages - Send message (non-streaming)
  app.post('/:id/messages', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const body = sendMessageSchema.parse(request.body);
      const result = await sessionsService.sendMessage(
        request.params.id,
        request.user!.userId,
        body
      );

      return reply.send({
        success: true,
        data: {
          userMessage: result.userMessage,
          aiMessage: result.aiMessage,
        },
        meta: {
          usage: result.usage,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/sessions/:id/chat/stream - Streaming chat (SSE)
  app.get('/:id/chat/stream', async (request: FastifyRequest<{ Params: { id: string }; Querystring: { message: string; attachments?: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { message, attachments: attachmentsStr } = request.query as { message?: string; attachments?: string };

    if (!message) {
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Message query parameter is required',
      });
    }

    // Parse attachments if provided
    let attachments: Array<{ id: string; filename: string; originalName: string; mimeType: string; url: string }> = [];
    if (attachmentsStr) {
      try {
        attachments = JSON.parse(attachmentsStr);
      } catch (e) {
        console.warn('Failed to parse attachments:', e);
      }
    }

    // Set SSE headers first
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      // Verify session
      await sessionsService.getById(id, request.user!.userId);

      // Import agent runtime
      const { agentRuntime } = await import('../agent-runtime/index.js');

      // Send start event
      reply.raw.write(`event: start\ndata: ${JSON.stringify({ sessionId: id, timestamp: new Date().toISOString() })}\n\n`);

      // Stream from agent runtime (with attachments)
      for await (const chunk of agentRuntime.chatStream(id, request.user!.userId, message, { attachments })) {
        console.log('SSE chunk:', chunk.type, chunk.type === 'chunk' ? chunk.content?.substring(0, 20) : '');
        
        if (chunk.type === 'chunk' && chunk.content) {
          reply.raw.write(`event: chunk\ndata: ${JSON.stringify({ content: chunk.content })}\n\n`);
        } else if ((chunk as any).type === 'tool_calling') {
          reply.raw.write(`event: tool_calling\ndata: ${JSON.stringify((chunk as any).tool_use)}\n\n`);
        } else if ((chunk as any).type === 'tool_result') {
          reply.raw.write(`event: tool_result\ndata: ${JSON.stringify((chunk as any).tool_result)}\n\n`);
        } else if (chunk.type === 'done') {
          reply.raw.write(`event: done\ndata: ${JSON.stringify({
            messageId: chunk.messageId,
            tokens: chunk.usage,
            cost: chunk.cost?.total,
          })}\n\n`);
        } else if (chunk.type === 'error') {
          console.error('Stream error:', chunk.error);
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`);
        }
      }

      reply.raw.end();
    } catch (error) {
      console.error('SSE stream error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`);
      reply.raw.end();
    }
  });
}
