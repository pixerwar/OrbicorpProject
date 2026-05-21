import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { join } from 'path';

import { config } from './config/index.js';
import { authRoutes } from './modules/auth/index.js';
import { agentsRoutes } from './modules/agents/index.js';
import { sessionsRoutes } from './modules/sessions/index.js';
import { usersRoutes } from './modules/users/index.js';
import { companiesRoutes } from './modules/companies/index.js';
import { llmRoutes } from './modules/agent-runtime/llm.routes.js';
import { uploadsRoutes } from './modules/uploads/index.js';
import { workflowsRoutes } from './modules/workflows/index.js';
import { tasksRoutes } from './modules/tasks/index.js';
import { channelsRoutes } from './modules/channels/index.js';
import { notificationsRoutes } from './modules/notifications/index.js';
import { webhooksRoutes } from './modules/messaging/index.js';
import { dashboardRoutes } from './modules/dashboard/index.js';
import { marketRoutes } from './modules/market/index.js';
import { prisma } from './shared/utils/prisma.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.log.level,
      transport: config.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
    // Allow empty body for POST requests
    bodyLimit: 1048576,
  });

  // Add content type parser for empty body
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = body ? JSON.parse(body as string) : {};
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  // Plugins
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for API
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  await app.register(sensible);

  // File upload support
  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB
    },
  });

  // Static file serving for uploads with CORS headers
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  // Static file serving for frontend (for ngrok/tunnel access)
  // Register as a separate plugin to avoid decorator conflict
  await app.register(async (instance) => {
    const fs = await import('fs');
    const path = await import('path');
    const cwd = process.cwd();
    
    // Olası frontend klasör yolları
    const possiblePaths = [
      join(cwd, '../orbicorp-frontend'),           // Normal yapı
      join(cwd, 'public'),                          // orbicorp-server/public
      path.resolve(cwd, '..', 'orbicorp-frontend'), // Absolute path
    ];
    
    console.log(`[Static] Current working directory: ${cwd}`);
    
    // İlk mevcut ve orbicorp-login.html içeren klasörü bul
    let frontendRoot: string | null = null;
    for (const p of possiblePaths) {
      const loginFile = join(p, 'orbicorp-login.html');
      const exists = fs.existsSync(loginFile);
      console.log(`[Static] Checking: ${p} -> ${exists ? '✅ Found' : '❌ Not found'}`);
      if (exists) {
        frontendRoot = p;
        break;
      }
    }
    
    if (frontendRoot) {
      console.log(`[Static] ✅ Frontend serving from: ${frontendRoot}`);
      
      await instance.register(fastifyStatic, {
        root: frontendRoot,
        prefix: '/',
        decorateReply: false,
        setHeaders: (res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
        },
      });
    } else {
      console.log(`[Static] ❌ Frontend not found! Checked paths:`);
      possiblePaths.forEach(p => console.log(`  - ${p}`));
    }
  });

  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Orbicorp API',
        description: 'AI Agent Management Platform API',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // API routes
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(agentsRoutes, { prefix: '/agents' });
      await api.register(sessionsRoutes, { prefix: '/sessions' });
      await api.register(usersRoutes, { prefix: '/users' });
      await api.register(companiesRoutes, { prefix: '/company' });
      await api.register(llmRoutes, { prefix: '/llm' });
      await api.register(uploadsRoutes, { prefix: '/uploads' });
      await api.register(workflowsRoutes, { prefix: '/workflows' });
      await api.register(tasksRoutes, { prefix: '/tasks' });
      await api.register(channelsRoutes, { prefix: '/channels' });
      await api.register(notificationsRoutes, { prefix: '/notifications' });
      await api.register(webhooksRoutes, { prefix: '/webhooks' });
      await api.register(dashboardRoutes, { prefix: '/dashboard' });
      await api.register(marketRoutes, { prefix: '/market' });
      // Future routes:
      // await api.register(knowledgeRoutes, { prefix: '/knowledge' });
    },
    { prefix: '/api/v1' }
  );

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    const statusCode = error.statusCode || 500;
    const message = config.isProduction && statusCode === 500
      ? 'Internal Server Error'
      : error.message;

    reply.status(statusCode).send({
      success: false,
      error: error.name || 'Error',
      message,
      ...(config.isDevelopment && { stack: error.stack }),
    });
  });

  // ============================================
  // STARTUP: Start Telegram polling for active channels
  // ============================================
  app.addHook('onReady', async () => {
    try {
      // Find all active Telegram channels
      const telegramChannels = await prisma.communicationChannel.findMany({
        where: {
          type: 'TELEGRAM',
          status: 'ACTIVE',
        },
        include: {
          company: true,
        },
      });

      if (telegramChannels.length > 0) {
        // Lazy import to avoid circular dependencies
        const { telegramService } = await import('./modules/messaging/telegram.service.js');
        
        for (const channel of telegramChannels) {
          const channelConfig = channel.config as { botToken?: string };
          
          if (channelConfig.botToken) {
            console.log(`[Startup] Telegram polling başlatılıyor: ${channel.name} (${channel.id})`);
            await telegramService.startPolling(channelConfig.botToken, channel.id);
          }
        }
        
        console.log(`[Startup] ${telegramChannels.length} Telegram kanalı için polling başlatıldı`);
      }
    } catch (error) {
      console.error('[Startup] Telegram polling başlatma hatası:', error);
    }
  });

  return app;
}
