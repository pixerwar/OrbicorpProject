import { z } from 'zod';

// Channel types
export const ChannelType = z.enum(['TELEGRAM', 'WHATSAPP', 'SLACK', 'EMAIL', 'SMS']);
export type ChannelType = z.infer<typeof ChannelType>;

// Telegram config
export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1, 'Bot token gerekli'),
  botUsername: z.string().optional(),
  defaultChatId: z.string().optional(), // Default chat/group to send messages
});

// WhatsApp config (using WhatsApp Business API)
export const WhatsAppConfigSchema = z.object({
  phoneNumberId: z.string().min(1, 'Phone Number ID gerekli'),
  accessToken: z.string().min(1, 'Access token gerekli'),
  businessAccountId: z.string().optional(),
});

// Slack config
export const SlackConfigSchema = z.object({
  botToken: z.string().min(1, 'Bot token gerekli'),
  defaultChannel: z.string().optional(),
});

// Generic config based on type
export const ChannelConfigSchema = z.union([
  TelegramConfigSchema,
  WhatsAppConfigSchema,
  SlackConfigSchema,
  z.object({}), // For other types
]);

// Create channel
export const CreateChannelSchema = z.object({
  type: ChannelType,
  name: z.string().min(1, 'Kanal adı gerekli').max(100),
  config: z.record(z.any()), // Will be validated based on type
});

export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;

// Update channel
export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.any()).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE', 'ERROR']).optional(),
});

export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;

// Channel response
export interface ChannelResponse {
  id: string;
  companyId: string;
  type: string;
  name: string;
  config: Record<string, any>; // Sensitive fields will be masked
  status: string;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Mask sensitive config fields for API responses
export function maskChannelConfig(type: string, config: Record<string, any>): Record<string, any> {
  const masked = { ...config };
  
  // Mask tokens and secrets
  const sensitiveFields = ['botToken', 'accessToken', 'apiKey', 'secret'];
  for (const field of sensitiveFields) {
    if (masked[field]) {
      const value = masked[field] as string;
      masked[field] = value.length > 8 
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : '****';
    }
  }
  
  return masked;
}
