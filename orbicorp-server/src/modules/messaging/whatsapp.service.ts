import { prisma } from '../../shared/utils/prisma.js';
import { notificationsService } from '../notifications/notifications.service.js';

interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text' | 'interactive';
  text?: {
    body: string;
  };
  interactive?: {
    type: 'button';
    body: {
      text: string;
    };
    action: {
      buttons: Array<{
        type: 'reply';
        reply: {
          id: string;
          title: string;
        };
      }>;
    };
  };
}

export class WhatsAppService {
  private baseUrl = 'https://graph.facebook.com/v18.0';
  
  // Send a message via WhatsApp Business API
  async sendMessage(phoneNumberId: string, accessToken: string, message: WhatsAppMessage): Promise<any> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    return response.json();
  }
  
  // Send approval notification with buttons
  async sendApprovalNotification(params: {
    channelId: string;
    notificationId: string;
    recipientPhone: string;
    title: string;
    message: string;
    taskName?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { channelId, notificationId, recipientPhone, title, message, taskName } = params;
    
    // Get channel config
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });
    
    if (!channel || channel.type !== 'WHATSAPP') {
      return { success: false, message: 'Kanal bulunamadı veya WhatsApp değil' };
    }
    
    const config = channel.config as { phoneNumberId: string; accessToken: string };
    
    if (!config.phoneNumberId || !config.accessToken) {
      return { success: false, message: 'WhatsApp yapılandırması eksik' };
    }
    
    // Format phone number (remove + and spaces)
    const formattedPhone = recipientPhone.replace(/[\s+\-()]/g, '');
    
    // Build message
    const bodyText = `🔔 *${title}*\n\n${message}${taskName ? `\n\n📋 Görev: ${taskName}` : ''}`;
    
    const whatsappMessage: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: bodyText,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `approve:${notificationId}`,
                title: '✅ Onayla',
              },
            },
            {
              type: 'reply',
              reply: {
                id: `reject:${notificationId}`,
                title: '❌ Reddet',
              },
            },
          ],
        },
      },
    };
    
    try {
      const result = await this.sendMessage(config.phoneNumberId, config.accessToken, whatsappMessage);
      
      if (result.messages && result.messages.length > 0) {
        // Update notification status
        await notificationsService.updateStatus(notificationId, 'SENT', new Date());
        return { success: true, message: 'Bildirim gönderildi' };
      } else {
        const errorMsg = result.error?.message || 'Gönderim başarısız';
        return { success: false, message: errorMsg };
      }
    } catch (error: any) {
      console.error('WhatsApp send error:', error);
      return { success: false, message: error.message || 'Bağlantı hatası' };
    }
  }
  
  // Handle incoming webhook (button press)
  async handleWebhook(payload: any): Promise<void> {
    // WhatsApp webhook structure
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    
    if (!messages || messages.length === 0) return;
    
    const message = messages[0];
    
    // Check if it's an interactive reply (button press)
    if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
      const buttonId = message.interactive.button_reply.id;
      const fromPhone = message.from;
      
      // Parse button ID
      const [action, notificationId] = buttonId.split(':');
      
      if (!notificationId || !['approve', 'reject'].includes(action)) {
        console.log('Invalid button action:', buttonId);
        return;
      }
      
      // Find notification
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });
      
      if (!notification || notification.response) {
        console.log('Notification not found or already responded:', notificationId);
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
                  message: `WhatsApp üzerinden ${response === 'APPROVED' ? 'onaylandı' : 'reddedildi'}`,
                },
              },
            },
          });
        }
        
        // Send confirmation message
        // Note: This would need the channel config to send the reply
        console.log(`Notification ${notificationId} ${response} via WhatsApp from ${fromPhone}`);
        
      } catch (error) {
        console.error('WhatsApp callback handling error:', error);
      }
    }
  }
  
  // Verify webhook (for initial setup)
  verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }
}

export const whatsappService = new WhatsAppService();
