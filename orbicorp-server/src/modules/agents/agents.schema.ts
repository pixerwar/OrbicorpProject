import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(255),
  description: z.string().optional(),
  department: z.string().optional(),
  modelProvider: z.enum(['anthropic', 'openai', 'google', 'openrouter']).nullable().optional(),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(100000).default(2000),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.any()).default([]),
  channels: z.array(z.string()).default([]),
  notificationChannelId: z.string().uuid().nullable().optional(),
});

export const updateAgentSchema = createAgentSchema.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

export const listAgentsQuery = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 20),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  department: z.string().optional(),
  search: z.string().optional(),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type ListAgentsQuery = z.infer<typeof listAgentsQuery>;
