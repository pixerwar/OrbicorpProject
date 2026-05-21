import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { agentRuntime, llmManager, LLM_PROVIDERS } from './index.js';
import { OPENROUTER_CONFIG } from './providers/openrouter.js';
import { authMiddleware, requireAdmin } from '../../shared/middleware/auth.js';

export async function llmRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/llm/status - Get LLM configuration status
  app.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const status = agentRuntime.getStatus();

    return reply.send({
      success: true,
      data: {
        configured: status.availableProviders.length > 0,
        providers: status.availableProviders,
        models: status.models,
      },
    });
  });

  // GET /api/v1/llm/providers - Get all available providers and models
  app.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: {
        ...LLM_PROVIDERS,
        openrouter: OPENROUTER_CONFIG,
      },
    });
  });

  // POST /api/v1/llm/test - Test LLM connection (admin only)
  app.post('/test', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider, model } = request.body as { provider?: string; model?: string };

    if (!provider) {
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Provider is required',
      });
    }

    if (!llmManager.hasProvider(provider)) {
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: `Provider ${provider} is not configured. Add the API key to .env`,
      });
    }

    try {
      const testMessages = [
        { role: 'user' as const, content: 'Say "Hello, Orbicorp!" in exactly those words.' },
      ];

      const result = await llmManager.chatWithProvider(provider, testMessages, {
        model,
        maxTokens: 50,
        temperature: 0,
      });

      return reply.send({
        success: result.success,
        data: {
          provider: result.provider,
          model: result.model,
          response: result.content,
          latency: result.latency,
          usage: result.usage,
          cost: result.cost,
          error: result.error,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      return reply.status(500).send({
        success: false,
        error: 'Test Failed',
        message,
      });
    }
  });

  // POST /api/v1/llm/benchmark - Benchmark all providers (admin only)
  app.post('/benchmark', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { prompt } = request.body as { prompt?: string };

    const testMessages = [
      { role: 'user' as const, content: prompt || 'What is 2+2? Answer in one word.' },
    ];

    try {
      const results = await llmManager.benchmark(testMessages, {
        maxTokens: 100,
        temperature: 0,
      });

      return reply.send({
        success: true,
        data: {
          prompt: testMessages[0].content,
          results: results.map(r => ({
            provider: r.provider,
            model: r.model,
            success: r.success,
            response: r.content?.substring(0, 200),
            latency: r.latency,
            tokens: r.usage.totalTokens,
            cost: r.cost.total,
            error: r.error,
          })),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Benchmark failed';
      return reply.status(500).send({
        success: false,
        error: 'Benchmark Failed',
        message,
      });
    }
  });
}
