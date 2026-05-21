import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/utils/prisma.js';
import { telegramService } from './telegram.service.js';
import { whatsappService } from './whatsapp.service.js';

export async function webhooksRoutes(app: FastifyInstance) {
  // Telegram webhook endpoint
  // URL: /api/v1/webhooks/telegram/:channelId
  app.post('/telegram/:channelId', async (request: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
    try {
      const { channelId } = request.params;
      const body = request.body as any;
      
      // Get channel config
      const channel = await prisma.communicationChannel.findUnique({
        where: { id: channelId },
      });
      
      if (!channel || channel.type !== 'TELEGRAM') {
        return reply.status(400).send({ error: 'Invalid channel' });
      }
      
      const config = channel.config as { botToken: string };
      
      // Handle callback query (button press)
      if (body.callback_query) {
        const query = body.callback_query;
        
        await telegramService.handleCallback({
          botToken: config.botToken,
          callbackQueryId: query.id,
          data: query.data,
          fromUserId: query.from.id,
          messageId: query.message.message_id,
          chatId: query.message.chat.id,
        });
      }
      
      // Handle regular messages (could be used for /start, /connect commands)
      if (body.message) {
        const message = body.message;
        const text = message.text || '';
        const chatId = message.chat.id;
        
        console.log(`[Telegram Webhook] Mesaj alındı: "${text}" from chat ${chatId}`);
        
        // Handle /start command - send welcome message
        if (text === '/start') {
          await telegramService.sendMessage(config.botToken, {
            chat_id: chatId,
            text: `👋 Merhaba! Ben Orbicorp AI asistanıyım.\n\nChat ID'niz: <code>${chatId}</code>\n\nBana herhangi bir soru sorabilir veya görev verebilirsiniz.`,
            parse_mode: 'HTML',
          });
        } else if (text === '/chatid') {
          // Handle /chatid command - return chat ID
          await telegramService.sendMessage(config.botToken, {
            chat_id: chatId,
            text: `Chat ID: <code>${chatId}</code>`,
            parse_mode: 'HTML',
          });
        } else if (text && !text.startsWith('/')) {
          // Normal mesaj - agent'a gönder (async, don't wait)
          console.log(`[Telegram Webhook] Agent'a yönlendiriliyor...`);
          
          // Get full channel with company
          const fullChannel = await prisma.communicationChannel.findUnique({
            where: { id: channelId },
            include: { company: true },
          });
          
          if (fullChannel) {
            // Process asynchronously so webhook returns quickly
            telegramService.handleWebhookMessage(
              config.botToken,
              fullChannel,
              chatId,
              text,
              message.from
            ).catch(err => {
              console.error('[Telegram Webhook] Agent message error:', err);
            });
          }
        }
      }
      
      return reply.send({ ok: true });
    } catch (error) {
      console.error('Telegram webhook error:', error);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }
  });

  // WhatsApp webhook verification (GET)
  app.get('/whatsapp/:channelId', async (request: FastifyRequest<{ 
    Params: { channelId: string };
    Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string };
  }>, reply: FastifyReply) => {
    try {
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'];
      
      const { channelId } = request.params;
      const channel = await prisma.communicationChannel.findUnique({
        where: { id: channelId },
      });
      
      if (!channel || channel.type !== 'WHATSAPP') {
        return reply.status(400).send('Invalid channel');
      }
      
      const config = channel.config as { verifyToken?: string };
      const verifyToken = config.verifyToken || 'orbicorp_verify';
      
      const result = whatsappService.verifyWebhook(mode || '', token || '', challenge || '', verifyToken);
      
      if (result) {
        return reply.send(result);
      }
      
      return reply.status(403).send('Verification failed');
    } catch (error) {
      console.error('WhatsApp verify error:', error);
      return reply.status(500).send('Verification error');
    }
  });

  // WhatsApp webhook messages (POST)
  app.post('/whatsapp/:channelId', async (request: FastifyRequest<{ Params: { channelId: string } }>, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      
      // Process webhook asynchronously
      whatsappService.handleWebhook(body).catch(err => {
        console.error('WhatsApp webhook processing error:', err);
      });
      
      // Always return 200 quickly to acknowledge receipt
      return reply.send({ status: 'received' });
    } catch (error) {
      console.error('WhatsApp webhook error:', error);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }
  });
}
