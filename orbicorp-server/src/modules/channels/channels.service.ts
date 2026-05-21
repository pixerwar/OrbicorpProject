import { prisma } from '../../shared/utils/prisma.js';
import { CreateChannelInput, UpdateChannelInput, maskChannelConfig } from './channels.schema.js';

export class ChannelsService {
  
  // List all channels for a company
  async list(companyId: string) {
    const channels = await prisma.communicationChannel.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    
    // Mask sensitive config data
    return channels.map(ch => ({
      ...ch,
      config: maskChannelConfig(ch.type, ch.config as Record<string, any>),
    }));
  }
  
  // Get single channel
  async get(companyId: string, id: string) {
    const channel = await prisma.communicationChannel.findFirst({
      where: { id, companyId },
    });
    
    if (!channel) return null;
    
    return {
      ...channel,
      config: maskChannelConfig(channel.type, channel.config as Record<string, any>),
    };
  }
  
  // Get channel with full config (for internal use)
  async getWithFullConfig(companyId: string, id: string) {
    return prisma.communicationChannel.findFirst({
      where: { id, companyId },
    });
  }
  
  // Create new channel
  async create(companyId: string, data: CreateChannelInput) {
    const channel = await prisma.communicationChannel.create({
      data: {
        companyId,
        type: data.type,
        name: data.name,
        config: data.config,
        status: 'PENDING',
      },
    });
    
    return {
      ...channel,
      config: maskChannelConfig(channel.type, channel.config as Record<string, any>),
    };
  }
  
  // Update channel
  async update(companyId: string, id: string, data: UpdateChannelInput) {
    // Check if channel exists
    const existing = await prisma.communicationChannel.findFirst({
      where: { id, companyId },
    });
    
    if (!existing) return null;
    
    const channel = await prisma.communicationChannel.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.config && { config: data.config }),
        ...(data.status && { status: data.status }),
      },
    });
    
    return {
      ...channel,
      config: maskChannelConfig(channel.type, channel.config as Record<string, any>),
    };
  }
  
  // Delete channel
  async delete(companyId: string, id: string) {
    const existing = await prisma.communicationChannel.findFirst({
      where: { id, companyId },
    });
    
    if (!existing) return false;
    
    await prisma.communicationChannel.delete({
      where: { id },
    });
    
    return true;
  }
  
  // Test channel connection
  async test(companyId: string, id: string): Promise<{ success: boolean; message: string }> {
    const channel = await prisma.communicationChannel.findFirst({
      where: { id, companyId },
    });
    
    if (!channel) {
      return { success: false, message: 'Kanal bulunamadı' };
    }
    
    const config = channel.config as Record<string, any>;
    
    try {
      switch (channel.type) {
        case 'TELEGRAM':
          return await this.testTelegram(config);
        case 'WHATSAPP':
          return await this.testWhatsApp(config);
        case 'SLACK':
          return await this.testSlack(config);
        default:
          return { success: false, message: 'Bu kanal türü henüz desteklenmiyor' };
      }
    } catch (error: any) {
      // Update status to ERROR
      await prisma.communicationChannel.update({
        where: { id },
        data: { status: 'ERROR' },
      });
      
      return { success: false, message: error.message || 'Bağlantı hatası' };
    }
  }
  
  // Test Telegram bot
  private async testTelegram(config: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const { botToken } = config;
    
    if (!botToken) {
      return { success: false, message: 'Bot token eksik' };
    }
    
    // Call Telegram getMe API
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      return { 
        success: true, 
        message: `Bot bağlantısı başarılı: @${data.result.username}` 
      };
    } else {
      return { 
        success: false, 
        message: data.description || 'Telegram API hatası' 
      };
    }
  }
  
  // Test WhatsApp connection
  private async testWhatsApp(config: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const { phoneNumberId, accessToken } = config;
    
    if (!phoneNumberId || !accessToken) {
      return { success: false, message: 'Phone Number ID veya Access Token eksik' };
    }
    
    // Call WhatsApp Business API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();
    
    if (data.id) {
      return { 
        success: true, 
        message: `WhatsApp bağlantısı başarılı: ${data.display_phone_number || phoneNumberId}` 
      };
    } else {
      return { 
        success: false, 
        message: data.error?.message || 'WhatsApp API hatası' 
      };
    }
  }
  
  // Test Slack connection
  private async testSlack(config: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const { botToken } = config;
    
    if (!botToken) {
      return { success: false, message: 'Bot token eksik' };
    }
    
    // Call Slack auth.test API
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = await response.json();
    
    if (data.ok) {
      return { 
        success: true, 
        message: `Slack bağlantısı başarılı: ${data.team}` 
      };
    } else {
      return { 
        success: false, 
        message: data.error || 'Slack API hatası' 
      };
    }
  }
  
  // Update channel status after successful test
  async markAsActive(companyId: string, id: string) {
    const channel = await prisma.communicationChannel.update({
      where: { id },
      data: { 
        status: 'ACTIVE',
        lastTestedAt: new Date(),
      },
    });

    // Start Telegram polling if it's a Telegram channel
    if (channel.type === 'TELEGRAM') {
      const { telegramService } = await import('../messaging/telegram.service.js');
      const config = channel.config as { botToken: string };
      if (config.botToken) {
        await telegramService.startPolling(config.botToken, channel.id);
      }
    }
  }
  
  // Get channels for dropdown (minimal info)
  async listForDropdown(companyId: string) {
    return prisma.communicationChannel.findMany({
      where: { 
        companyId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}

export const channelsService = new ChannelsService();
