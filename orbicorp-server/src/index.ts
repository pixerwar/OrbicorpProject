import { buildApp } from './app.js';
import { config } from './config/index.js';
import prisma from './shared/utils/prisma.js';
import { telegramService } from './modules/messaging/telegram.service.js';

async function main() {
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      
      await app.close();
      await prisma.$disconnect();
      
      app.log.info('Server closed');
      process.exit(0);
    });
  }

  try {
    // Test database connection
    await prisma.$connect();
    app.log.info('✅ Database connected');

    // Start server
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    // Start Telegram polling for active channels
    try {
      await telegramService.startAllPolling();
      app.log.info('✅ Telegram polling started');
    } catch (err) {
      app.log.warn('⚠️ Telegram polling could not start:', err);
    }

    app.log.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Orbicorp Server is running!                         ║
║                                                           ║
║   API:     http://localhost:${config.server.port}/api/v1             ║
║   Docs:    http://localhost:${config.server.port}/docs               ║
║   Health:  http://localhost:${config.server.port}/health             ║
║                                                           ║
║   Environment: ${config.env.padEnd(40)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
