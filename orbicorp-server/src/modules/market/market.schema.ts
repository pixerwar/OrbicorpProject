import { z } from 'zod';

// ==========================================
// QUERY SCHEMAS
// ==========================================

export const listPackagesQuerySchema = z.object({
  type: z.enum(['SKILL', 'TOOL', 'AGENT_TEMPLATE', 'LANGUAGE_PACK', 'WORKFLOW_TEMPLATE']).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.enum(['popular', 'newest', 'rating', 'name']).default('popular'),
});

export type ListPackagesQuery = z.infer<typeof listPackagesQuerySchema>;

// ==========================================
// BODY SCHEMAS
// ==========================================

export const installPackageBodySchema = z.object({
  packageId: z.string().uuid(),
  config: z.record(z.any()).optional(),
});

export type InstallPackageBody = z.infer<typeof installPackageBodySchema>;

export const updatePackageConfigBodySchema = z.object({
  config: z.record(z.any()),
});

export type UpdatePackageConfigBody = z.infer<typeof updatePackageConfigBodySchema>;

export const assignPackageToAgentBodySchema = z.object({
  installationId: z.string().uuid(),
});

export type AssignPackageToAgentBody = z.infer<typeof assignPackageToAgentBodySchema>;

// Tool tanımı
const toolSchema = z.object({
  name: z.string().regex(/^[a-z_]+$/),
  description: z.string(),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
  }),
  handler: z.string().optional(),
  examples: z.array(z.object({
    input: z.record(z.any()),
    output: z.any(),
  })).optional(),
});

// Config field tanımı
const configFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'secret']),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.any().optional(),
});

// Agent template tanımı
const agentTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  department: z.string().optional(),
  systemPrompt: z.string(),
  suggestedModel: z.object({
    provider: z.string(),
    modelId: z.string(),
  }).optional(),
  temperature: z.number().min(0).max(2).optional(),
  skills: z.array(z.string()).optional(),
  avatarUrl: z.string().optional(),
});

// Workflow template tanımı
const workflowTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  trigger: z.object({
    type: z.enum(['manual', 'schedule', 'event', 'webhook']),
    config: z.record(z.any()).optional(),
  }).optional(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.enum(['agent', 'condition', 'action', 'delay', 'loop']),
    config: z.record(z.any()).optional(),
    next: z.string().optional(),
    branches: z.record(z.string()).optional(),
  })),
  variables: z.record(z.any()).optional(),
});

// Translations tanımı
const translationsSchema = z.object({
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  name: z.string().optional(),
  strings: z.record(z.string()),
});

// Create package body
export const createPackageBodySchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'Name must be lowercase with hyphens only'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  type: z.enum(['SKILL', 'TOOL', 'AGENT_TEMPLATE', 'LANGUAGE_PACK', 'WORKFLOW_TEMPLATE']),
  displayName: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  category: z.enum(['core', 'productivity', 'integration', 'communication', 'analytics', 'automation', 'custom']).optional(),
  tags: z.array(z.string()).optional(),
  
  // Pricing
  pricingModel: z.enum(['FREE', 'ONE_TIME', 'SUBSCRIPTION']).default('FREE'),
  price: z.number().min(0).optional(),
  currency: z.string().default('USD'),
  
  // Compatibility
  minVersion: z.string().optional(),
  providers: z.array(z.enum(['anthropic', 'openai', 'google', 'openrouter'])).optional(),
  
  // Permissions & Dependencies
  permissions: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  
  // Content
  tools: z.array(toolSchema).optional(),
  configSchema: z.record(configFieldSchema).optional(),
  systemPromptAddition: z.string().optional(),
  
  // Type-specific content
  agentTemplate: agentTemplateSchema.optional(),
  workflowTemplate: workflowTemplateSchema.optional(),
  translations: translationsSchema.optional(),
  
  // Documentation
  readme: z.string().optional(),
});

export type CreatePackageBody = z.infer<typeof createPackageBodySchema>;

// ==========================================
// FASTIFY SCHEMAS (for route registration)
// ==========================================

export const listPackagesSchema = {
  querystring: listPackagesQuerySchema,
};

export const installPackageSchema = {
  body: installPackageBodySchema,
};

export const updatePackageConfigSchema = {
  body: updatePackageConfigBodySchema,
};

export const assignPackageToAgentSchema = {
  body: assignPackageToAgentBodySchema,
};

export const createPackageSchema = {
  body: createPackageBodySchema,
};
