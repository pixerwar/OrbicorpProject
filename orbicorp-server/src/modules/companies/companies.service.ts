import prisma from '../../shared/utils/prisma.js';
import { UpdateCompanyInput, UpdateBrandingInput } from './companies.schema.js';

export class CompaniesService {
  // Get company by ID
  async getById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            agents: true,
            workflows: true,
            integrations: true,
          },
        },
      },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    return {
      ...company,
      stats: {
        users: company._count.users,
        agents: company._count.agents,
        workflows: company._count.workflows,
        integrations: company._count.integrations,
      },
      _count: undefined,
    };
  }

  // Update company
  async update(id: string, input: UpdateCompanyInput) {
    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    // Merge settings
    const currentSettings = (company.settings as Record<string, any>) || {};
    const newSettings = input.settings ? { ...currentSettings, ...input.settings } : currentSettings;

    const updated = await prisma.company.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        settings: newSettings,
      },
    });

    return updated;
  }

  // Update branding
  async updateBranding(id: string, input: UpdateBrandingInput) {
    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const currentSettings = (company.settings as Record<string, any>) || {};
    const branding = {
      ...currentSettings.branding,
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      ...(input.primaryColor && { primaryColor: input.primaryColor }),
      ...(input.accentColor && { accentColor: input.accentColor }),
    };

    const updated = await prisma.company.update({
      where: { id },
      data: {
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        settings: {
          ...currentSettings,
          branding,
        },
      },
    });

    return updated;
  }

  // Get company dashboard stats
  async getDashboardStats(id: string) {
    const [
      userCount,
      agentCount,
      activeAgents,
      totalSessions,
      totalMessages,
      recentMessages,
    ] = await Promise.all([
      prisma.user.count({ where: { companyId: id } }),
      prisma.agent.count({ where: { companyId: id } }),
      prisma.agent.count({ where: { companyId: id, status: 'ACTIVE' } }),
      prisma.session.count({ where: { agent: { companyId: id } } }),
      prisma.message.count({ where: { session: { agent: { companyId: id } } } }),
      prisma.message.findMany({
        where: {
          session: { agent: { companyId: id } },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: {
          tokensUsed: true,
          costUsd: true,
        },
      }),
    ]);

    const monthlyTokens = recentMessages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
    const monthlyCost = recentMessages.reduce((sum, m) => sum + (m.costUsd || 0), 0);

    return {
      users: userCount,
      agents: {
        total: agentCount,
        active: activeAgents,
      },
      sessions: totalSessions,
      messages: totalMessages,
      monthly: {
        tokens: monthlyTokens,
        cost: monthlyCost,
        messages: recentMessages.length,
      },
    };
  }

  // Get LLM configuration status
  async getLLMConfig(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      select: { llmConfig: true },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const llmConfig = (company.llmConfig as Record<string, string>) || {};
    
    // Return provider status without exposing full API keys
    const providers = ['anthropic', 'openai', 'google', 'openrouter'];
    const status: Record<string, { configured: boolean; keyPreview?: string }> = {};

    for (const provider of providers) {
      const key = llmConfig[provider];
      if (key && key.length > 0) {
        status[provider] = {
          configured: true,
          keyPreview: `${key.substring(0, 8)}...${key.substring(key.length - 4)}`,
        };
      } else {
        status[provider] = { configured: false };
      }
    }

    // Check which providers are available
    const hasAnyProvider = Object.values(status).some(s => s.configured);
    const defaultProvider = hasAnyProvider 
      ? providers.find(p => status[p].configured) 
      : null;

    return {
      providers: status,
      hasAnyProvider,
      defaultProvider,
    };
  }

  // Update LLM configuration
  async updateLLMConfig(id: string, provider: string, apiKey: string) {
    const validProviders = ['anthropic', 'openai', 'google', 'openrouter'];
    if (!validProviders.includes(provider)) {
      throw new Error('Invalid provider. Must be one of: ' + validProviders.join(', '));
    }

    const company = await prisma.company.findUnique({
      where: { id },
      select: { llmConfig: true },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const currentConfig = (company.llmConfig as Record<string, string>) || {};
    const newConfig = { ...currentConfig, [provider]: apiKey };

    await prisma.company.update({
      where: { id },
      data: { llmConfig: newConfig },
    });

    return this.getLLMConfig(id);
  }

  // Remove LLM provider configuration
  async removeLLMConfig(id: string, provider: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      select: { llmConfig: true },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const currentConfig = (company.llmConfig as Record<string, string>) || {};
    delete currentConfig[provider];

    await prisma.company.update({
      where: { id },
      data: { llmConfig: currentConfig },
    });

    return this.getLLMConfig(id);
  }
}

export const companiesService = new CompaniesService();
