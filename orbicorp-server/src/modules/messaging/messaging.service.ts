import { prisma } from '../../shared/utils/prisma.js';
import { telegramService } from './telegram.service.js';
import { whatsappService } from './whatsapp.service.js';
import { notificationsService } from '../notifications/notifications.service.js';

export class MessagingService {
  
  // Send notification via the appropriate channel
  async sendNotification(params: {
    notificationId: string;
    channelId: string;
    recipientPhone?: string; // For WhatsApp
    title: string;
    message: string;
    taskName?: string;
    detailsUrl?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { notificationId, channelId, recipientPhone, title, message, taskName, detailsUrl } = params;
    
    // Get channel with company settings
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
      include: { company: true },
    });
    
    if (!channel) {
      return { success: false, message: 'Kanal bulunamadı' };
    }
    
    if (channel.status !== 'ACTIVE') {
      return { success: false, message: 'Kanal aktif değil' };
    }

    // Check if external notifications are enabled for the company
    const companySettings = channel.company.settings as { externalNotificationsEnabled?: boolean } || {};
    if (companySettings.externalNotificationsEnabled === false) {
      console.log(`[Messaging] External notifications disabled for company ${channel.companyId}`);
      return { success: false, message: 'Harici kanal bildirimleri kapalı' };
    }
    
    switch (channel.type) {
      case 'TELEGRAM':
        return telegramService.sendApprovalNotification({
          channelId,
          notificationId,
          title,
          message,
          taskName,
          detailsUrl,
        });
        
      case 'WHATSAPP':
        if (!recipientPhone) {
          return { success: false, message: 'Alıcı telefon numarası gerekli' };
        }
        return whatsappService.sendApprovalNotification({
          channelId,
          notificationId,
          recipientPhone,
          title,
          message,
          taskName,
        });
        
      default:
        return { success: false, message: `${channel.type} kanalı henüz desteklenmiyor` };
    }
  }
  
  // Create and send an approval notification
  async createAndSendApproval(params: {
    companyId: string;
    userId: string;
    taskId: string;
    taskName: string;
    agentId?: string;
    details?: Record<string, any>;
    detailsUrl?: string;
  }): Promise<{ success: boolean; notificationId?: string; message: string }> {
    const { companyId, userId, taskId, taskName, agentId, details, detailsUrl } = params;
    
    // Get user's notification preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        notificationPreferences: true,
        telegramChatId: true,
        whatsappNumber: true,
      },
    });
    
    if (!user) {
      return { success: false, message: 'Kullanıcı bulunamadı' };
    }
    
    // Check if agent has a notification channel
    let channelId: string | null = null;
    
    if (agentId) {
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { notificationChannelId: true },
      });
      channelId = agent?.notificationChannelId || null;
    }
    
    // Create notification
    const notification = await notificationsService.createApprovalNotification({
      companyId,
      userId,
      taskId,
      taskName,
      channelId: channelId || undefined,
      details,
    });
    
    // If there's a channel, send external notification
    if (channelId) {
      const channel = await prisma.communicationChannel.findUnique({
        where: { id: channelId },
      });
      
      if (channel && channel.status === 'ACTIVE') {
        // Determine recipient based on channel type
        let recipientPhone: string | undefined;
        
        if (channel.type === 'WHATSAPP' && user.whatsappNumber) {
          recipientPhone = user.whatsappNumber;
        }
        
        const sendResult = await this.sendNotification({
          notificationId: notification.id,
          channelId,
          recipientPhone,
          title: notification.title,
          message: notification.message,
          taskName,
          detailsUrl,
        });
        
        if (!sendResult.success) {
          console.warn(`Failed to send external notification: ${sendResult.message}`);
          // Don't fail the whole operation, notification was still created
        }
      }
    }
    
    return {
      success: true,
      notificationId: notification.id,
      message: 'Bildirim oluşturuldu',
    };
  }
}

export const messagingService = new MessagingService();
