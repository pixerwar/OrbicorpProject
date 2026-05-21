import { prisma } from '../../shared/utils/prisma.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { agentRuntime as agentRuntimeService } from '../agent-runtime/agent-runtime.service.js';

interface TelegramMessage {
  chat_id: string | number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: {
    inline_keyboard: Array<Array<{
      text: string;
      callback_data?: string;
      url?: string;
    }>>;
  };
}

interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

export class TelegramService {
  
  // Send a message via Telegram
  async sendMessage(botToken: string, message: TelegramMessage): Promise<TelegramResponse> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    console.log(`[Telegram] Mesaj gönderiliyor -> chat_id: ${message.chat_id}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error(`[Telegram] Mesaj gönderilemedi:`, result.description);
    } else {
      console.log(`[Telegram] Mesaj başarıyla gönderildi`);
    }
    
    return result;
  }
  
  // Send approval notification
  async sendApprovalNotification(params: {
    channelId: string;
    notificationId: string;
    title: string;
    message: string;
    taskName?: string;
    detailsUrl?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { channelId, notificationId, title, message, taskName, detailsUrl } = params;
    
    // Get channel config
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });
    
    if (!channel || channel.type !== 'TELEGRAM') {
      return { success: false, message: 'Kanal bulunamadı veya Telegram değil' };
    }
    
    const config = channel.config as { botToken: string; defaultChatId?: string };
    
    if (!config.botToken) {
      return { success: false, message: 'Bot token eksik' };
    }
    
    if (!config.defaultChatId) {
      return { success: false, message: 'Chat ID tanımlanmamış' };
    }
    
    // Build message text
    const text = `
🔔 <b>${this.escapeHtml(title)}</b>

${this.escapeHtml(message)}
${taskName ? `\n📋 Görev: ${this.escapeHtml(taskName)}` : ''}
`.trim();
    
    // Build inline keyboard with approve/reject buttons
    const keyboard: TelegramMessage['reply_markup'] = {
      inline_keyboard: [
        [
          { text: '✅ Onayla', callback_data: `approve:${notificationId}` },
          { text: '❌ Reddet', callback_data: `reject:${notificationId}` },
        ],
      ],
    };
    
    // Add details link if provided
    if (detailsUrl) {
      keyboard.inline_keyboard.push([
        { text: '📄 Detayları Gör', url: detailsUrl },
      ]);
    }
    
    try {
      const result = await this.sendMessage(config.botToken, {
        chat_id: config.defaultChatId,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      
      if (result.ok) {
        // Update notification status
        await notificationsService.updateStatus(notificationId, 'SENT', new Date());
        return { success: true, message: 'Bildirim gönderildi' };
      } else {
        return { success: false, message: result.description || 'Gönderim başarısız' };
      }
    } catch (error: any) {
      console.error('Telegram send error:', error);
      return { success: false, message: error.message || 'Bağlantı hatası' };
    }
  }
  
  // Handle Telegram callback (button press)
  async handleCallback(params: {
    botToken: string;
    callbackQueryId: string;
    data: string;
    fromUserId: number;
    messageId: number;
    chatId: number;
  }): Promise<void> {
    const { botToken, callbackQueryId, data, fromUserId, messageId, chatId } = params;
    
    // Parse callback data
    const [action, notificationId] = data.split(':');
    
    if (!notificationId || !['approve', 'reject'].includes(action)) {
      await this.answerCallback(botToken, callbackQueryId, 'Geçersiz işlem');
      return;
    }
    
    // Find notification
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: true },
    });
    
    if (!notification) {
      await this.answerCallback(botToken, callbackQueryId, 'Bildirim bulunamadı');
      return;
    }
    
    if (notification.response) {
      await this.answerCallback(botToken, callbackQueryId, 'Bu bildirim zaten yanıtlandı');
      return;
    }
    
    // Process response
    const response = action === 'approve' ? 'APPROVED' : 'REJECTED';
    
    try {
      // Update notification
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'RESPONDED',
          response,
          respondedAt: new Date(),
        },
      });
      
      // Update related task if exists
      if (notification.taskId) {
        const newStatus = response === 'APPROVED' ? 'RUNNING' : 'CANCELLED';
        await prisma.task.update({
          where: { id: notification.taskId },
          data: {
            status: newStatus,
            logs: {
              push: {
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Telegram üzerinden ${response === 'APPROVED' ? 'onaylandı' : 'reddedildi'}`,
              },
            },
          },
        });
      }
      
      // Answer callback
      await this.answerCallback(
        botToken, 
        callbackQueryId, 
        response === 'APPROVED' ? '✅ Onaylandı!' : '❌ Reddedildi'
      );
      
      // Edit the original message to show the result
      await this.editMessageText(botToken, chatId, messageId, 
        `${response === 'APPROVED' ? '✅' : '❌'} ${notification.title}\n\n` +
        `Durum: ${response === 'APPROVED' ? 'ONAYLANDI' : 'REDDEDİLDİ'}`
      );
      
    } catch (error) {
      console.error('Callback handling error:', error);
      await this.answerCallback(botToken, callbackQueryId, 'İşlem sırasında hata oluştu');
    }
  }
  
  // Answer callback query (acknowledge button press)
  private async answerCallback(botToken: string, callbackQueryId: string, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    });
  }
  
  // Edit message text
  private async editMessageText(
    botToken: string, 
    chatId: number, 
    messageId: number, 
    text: string
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
      }),
    });
  }
  
  // Escape HTML special characters
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  
  // Get bot info (for testing connection)
  async getBotInfo(botToken: string): Promise<{ success: boolean; username?: string; message?: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await response.json();
      
      if (data.ok) {
        return { success: true, username: data.result.username };
      } else {
        return { success: false, message: data.description };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
  
  // Set webhook URL for receiving updates
  async setWebhook(botToken: string, webhookUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      
      const data = await response.json();
      
      if (data.ok) {
        return { success: true, message: 'Webhook ayarlandı' };
      } else {
        return { success: false, message: data.description || 'Webhook ayarlanamadı' };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Polling için son update ID'leri (bot başına)
  private pollingOffsets: Map<string, number> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Polling başlat
  async startPolling(botToken: string, channelId: string) {
    // Zaten polling varsa durdur
    this.stopPolling(channelId);

    console.log(`[Telegram] ✅ Polling başlatılıyor: ${channelId}`);

    const poll = async () => {
      try {
        // Check if external notifications are still enabled
        const channel = await prisma.communicationChannel.findUnique({
          where: { id: channelId },
          include: { company: true },
        });

        if (!channel || channel.status !== 'ACTIVE') {
          console.log(`[Telegram] ⚠️ Channel ${channelId} not active, stopping poll`);
          return;
        }

        const companySettings = (channel.company.settings as { externalNotificationsEnabled?: boolean }) || {};
        // Default: enabled (undefined veya true ise çalış)
        const isEnabled = companySettings.externalNotificationsEnabled !== false;
        
        if (!isEnabled) {
          // Notifications disabled - still poll but don't respond to messages (only consume updates)
          const offset = this.pollingOffsets.get(channelId) || 0;
          const response = await fetch(
            `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=5`
          );
          const data = await response.json();
          if (data.ok && data.result.length > 0) {
            const lastUpdate = data.result[data.result.length - 1];
            this.pollingOffsets.set(channelId, lastUpdate.update_id + 1);
          }
          return;
        }

        const offset = this.pollingOffsets.get(channelId) || 0;
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=30`
        );
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
          console.log(`[Telegram] 📥 ${data.result.length} yeni güncelleme alındı (channel: ${channelId})`);
          
          for (const update of data.result) {
            // Offset'i güncelle
            this.pollingOffsets.set(channelId, update.update_id + 1);
            
            console.log(`[Telegram] Update tipi:`, {
              update_id: update.update_id,
              hasCallbackQuery: !!update.callback_query,
              hasMessage: !!update.message,
              text: update.message?.text?.substring(0, 50),
            });

            // Callback query (buton tıklaması)
            if (update.callback_query) {
              const query = update.callback_query;
              await this.handleCallback({
                botToken,
                callbackQueryId: query.id,
                data: query.data,
                fromUserId: query.from.id,
                messageId: query.message.message_id,
                chatId: query.message.chat.id,
              });
            }

            // Normal mesaj
            if (update.message) {
              const message = update.message;
              const text = message.text || '';
              const chatId = message.chat.id;
              
              console.log(`[Telegram] 💬 Mesaj alındı: "${text}" from chat ${chatId}`);

              if (text === '/start') {
                await this.sendMessage(botToken, {
                  chat_id: chatId,
                  text: `👋 Merhaba! Ben Orbicorp AI asistanıyım.\n\nChat ID'niz: <code>${chatId}</code>\n\nBana herhangi bir soru sorabilir veya görev verebilirsiniz.`,
                  parse_mode: 'HTML',
                });
              } else if (text === '/chatid') {
                await this.sendMessage(botToken, {
                  chat_id: chatId,
                  text: `Chat ID: <code>${chatId}</code>`,
                  parse_mode: 'HTML',
                });
              } else if (text && !text.startsWith('/')) {
                // Normal mesaj - agent'a gönder
                console.log(`[Telegram] 🤖 Agent'a yönlendiriliyor...`);
                await this.handleAgentMessage(botToken, channel, chatId, text, message.from);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Telegram] ❌ Polling hatası (${channelId}):`, error);
      }
    };

    // İlk poll
    poll();

    // Her 5 saniyede bir poll (long polling timeout 30 saniye)
    const interval = setInterval(poll, 5000);
    this.pollingIntervals.set(channelId, interval);
  }

  // Webhook'tan gelen mesajı işle (public wrapper)
  async handleWebhookMessage(
    botToken: string,
    channel: any,
    chatId: number,
    text: string,
    telegramUser: { id: number; first_name?: string; last_name?: string; username?: string }
  ): Promise<void> {
    return this.handleAgentMessage(botToken, channel, chatId, text, telegramUser);
  }

  // Telegram'dan gelen mesajı agent'a gönder ve cevabı döndür
  private async handleAgentMessage(
    botToken: string,
    channel: any,
    chatId: number,
    text: string,
    telegramUser: { id: number; first_name?: string; last_name?: string; username?: string }
  ): Promise<void> {
    try {
      console.log(`[Telegram] 🔄 handleAgentMessage başladı - chatId: ${chatId}, text: "${text.substring(0, 50)}..."`);
      
      // "Yazıyor..." göster
      await this.sendChatAction(botToken, chatId, 'typing');

      // Şirketin main agent'ını bul
      const mainAgent = await prisma.agent.findFirst({
        where: {
          companyId: channel.companyId,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!mainAgent) {
        console.log(`[Telegram] ❌ Aktif agent bulunamadı - companyId: ${channel.companyId}`);
        await this.sendMessage(botToken, {
          chat_id: chatId,
          text: '❌ Aktif bir agent bulunamadı. Lütfen Orbicorp panelinden bir agent oluşturun.',
        });
        return;
      }

      console.log(`[Telegram] ✅ Agent bulundu: ${mainAgent.name} (${mainAgent.id})`);

      // Telegram kullanıcısı için bir user bul veya oluştur
      const telegramExternalId = `telegram:${telegramUser.id}`;
      let user = await prisma.user.findFirst({
        where: {
          companyId: channel.companyId,
          telegramChatId: String(telegramUser.id),
        },
      });

      if (!user) {
        // Şirketin ilk kullanıcısını kullan (admin)
        user = await prisma.user.findFirst({
          where: { companyId: channel.companyId },
          orderBy: { createdAt: 'asc' },
        });
        console.log(`[Telegram] ℹ️ Telegram kullanıcısı bulunamadı, admin kullanılıyor: ${user?.email}`);
      }

      if (!user) {
        console.log(`[Telegram] ❌ Kullanıcı bulunamadı`);
        await this.sendMessage(botToken, {
          chat_id: chatId,
          text: '❌ Kullanıcı bulunamadı.',
        });
        return;
      }

      // Session bul veya oluştur (Telegram chat'i için)
      let session = await prisma.session.findFirst({
        where: {
          agentId: mainAgent.id,
          userId: user.id,
          channel: 'TELEGRAM',
          externalId: telegramExternalId,
          status: 'ACTIVE',
        },
      });

      if (!session) {
        console.log(`[Telegram] 📝 Yeni session oluşturuluyor...`);
        session = await prisma.session.create({
          data: {
            agentId: mainAgent.id,
            userId: user.id,
            channel: 'TELEGRAM',
            externalId: telegramExternalId,
            status: 'ACTIVE',
            metadata: {
              telegramChatId: chatId,
              telegramUser: {
                id: telegramUser.id,
                firstName: telegramUser.first_name,
                lastName: telegramUser.last_name,
                username: telegramUser.username,
              },
            },
          },
        });
        console.log(`[Telegram] ✅ Session oluşturuldu: ${session.id}`);
      } else {
        console.log(`[Telegram] ✅ Mevcut session kullanılıyor: ${session.id}`);
      }

      // Agent'a mesaj gönder ve cevap al (streaming)
      console.log(`[Telegram] 🚀 Agent'a mesaj gönderiliyor...`);
      let responseText = '';
      
      for await (const chunk of agentRuntimeService.chatStream(
        session.id,
        user.id,
        text,
        {}
      )) {
        if (chunk.type === 'chunk' && chunk.content) {
          responseText += chunk.content;
        }
        if (chunk.type === 'error') {
          console.error(`[Telegram] ❌ Agent error:`, chunk.error);
          throw new Error(chunk.error);
        }
      }

      console.log(`[Telegram] ✅ Agent cevabı alındı (${responseText.length} karakter)`);

      // Cevabı Telegram'a gönder
      if (responseText) {
        // Telegram mesaj limiti 4096 karakter
        const maxLength = 4000;
        if (responseText.length > maxLength) {
          // Uzun mesajları böl
          const parts = this.splitMessage(responseText, maxLength);
          console.log(`[Telegram] 📤 Uzun mesaj ${parts.length} parçaya bölündü`);
          for (const part of parts) {
            await this.sendMessage(botToken, {
              chat_id: chatId,
              text: part,
              parse_mode: 'Markdown',
            });
          }
        } else {
          await this.sendMessage(botToken, {
            chat_id: chatId,
            text: responseText,
            parse_mode: 'Markdown',
          });
        }
      } else {
        console.log(`[Telegram] ⚠️ Agent boş cevap döndü`);
        await this.sendMessage(botToken, {
          chat_id: chatId,
          text: 'Yanıt oluşturulamadı. Lütfen tekrar deneyin.',
        });
      }

    } catch (error: any) {
      console.error('[Telegram] ❌ Agent message error:', error);
      await this.sendMessage(botToken, {
        chat_id: chatId,
        text: `❌ Hata: ${error.message || 'Bilinmeyen hata'}`,
      });
    }
  }

  // "Yazıyor..." göster
  private async sendChatAction(botToken: string, chatId: number, action: string): Promise<void> {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
    } catch (error) {
      // Ignore errors
    }
  }

  // Uzun mesajları böl
  private splitMessage(text: string, maxLength: number): string[] {
    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        parts.push(remaining);
        break;
      }

      // Son satır sonunu veya boşluğu bul
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      parts.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    return parts;
  }

  // Polling durdur
  stopPolling(channelId: string) {
    const interval = this.pollingIntervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(channelId);
      console.log(`[Telegram] 🛑 Polling durduruldu: ${channelId}`);
    }
  }

  // Tüm aktif kanallar için polling başlat
  async startAllPolling() {
    const channels = await prisma.communicationChannel.findMany({
      where: { type: 'TELEGRAM', status: 'ACTIVE' },
    });

    for (const channel of channels) {
      const config = channel.config as { botToken: string };
      if (config.botToken) {
        await this.startPolling(config.botToken, channel.id);
      }
    }

    console.log(`[Telegram] ✅ ${channels.length} kanal için polling başlatıldı`);
  }
}

export const telegramService = new TelegramService();
