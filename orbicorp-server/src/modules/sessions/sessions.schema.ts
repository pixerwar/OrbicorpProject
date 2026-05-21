import { z } from 'zod';

export const createSessionSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  channel: z.string().optional().default('webchat'),
  metadata: z.record(z.any()).optional().default({}),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  attachments: z.array(z.object({
    id: z.string(),
    filename: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    size: z.number(),
    url: z.string(),
  })).optional().default([]),
  metadata: z.record(z.any()).optional().default({}),
});

export const listSessionsQuery = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 20),
  agentId: z.string().optional(),
  status: z.enum(['ACTIVE', 'ENDED', 'ARCHIVED']).optional(),
});

export const listMessagesQuery = z.object({
  limit: z.string().optional().transform(v => v ? parseInt(v) : 50),
  before: z.string().optional(), // cursor-based pagination
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuery>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuery>;
