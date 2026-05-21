import prisma from '../../shared/utils/prisma.js';
import { CreateAgentInput, UpdateAgentInput, ListAgentsQuery } from './agents.schema.js';
import { Prisma } from '@prisma/client';

export class AgentsService {
  // Get Main Agent for company
  async getMainAgent(companyId: string) {
    const agent = await prisma.agent.findFirst({
      where: { companyId, isMain: true },
    });

    if (!agent) {
      // Main agent yoksa oluştur
      const newAgent = await prisma.agent.create({
        data: {
          companyId,
          name: 'Main Agent',
          description: 'Şirketinizin ana AI asistanı',
          department: 'Genel',
          isMain: true,
          modelProvider: null,
          modelId: null,
          systemPrompt: 'Sen şirketin ana AI asistanısın. Her konuda yardımcı ol.',
          channels: ['webchat'],
          status: 'ACTIVE',
        },
      });
      return newAgent;
    }

    return agent;
  }

  // List agents with pagination and filters
  async list(companyId: string, query: ListAgentsQuery) {
    const { page, limit, status, department, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AgentWhereInput = {
      companyId,
      ...(status && { status }),
      ...(department && { department }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          avatarUrl: true,
          department: true,
          isMain: true,
          modelProvider: true,
          modelId: true,
          systemPrompt: true,
          temperature: true,
          maxTokens: true,
          skills: true,
          tools: true,
          status: true,
          stats: true,
          channels: true,
          notificationChannelId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.agent.count({ where }),
    ]);

    return {
      agents,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single agent by ID
  async getById(id: string, companyId: string) {
    const agent = await prisma.agent.findFirst({
      where: { id, companyId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    return agent;
  }

  // Create new agent
  async create(companyId: string, input: CreateAgentInput) {
    const agent = await prisma.agent.create({
      data: {
        companyId,
        name: input.name,
        description: input.description,
        department: input.department,
        modelProvider: input.modelProvider,
        modelId: input.modelId,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        skills: input.skills,
        tools: input.tools,
        channels: input.channels,
      },
    });

    return agent;
  }

  // Update agent
  async update(id: string, companyId: string, input: UpdateAgentInput) {
    // Check if agent exists and belongs to company
    const existing = await prisma.agent.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Agent not found');
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.department !== undefined && { department: input.department }),
        ...(input.modelProvider !== undefined && { modelProvider: input.modelProvider }),
        ...(input.modelId !== undefined && { modelId: input.modelId }),
        ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
        ...(input.skills !== undefined && { skills: input.skills }),
        ...(input.tools !== undefined && { tools: input.tools }),
        ...(input.channels !== undefined && { channels: input.channels }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.notificationChannelId !== undefined && { notificationChannelId: input.notificationChannelId || null }),
      },
    });

    return agent;
  }

  // Delete agent
  async delete(id: string, companyId: string) {
    // Check if agent exists and belongs to company
    const existing = await prisma.agent.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Agent not found');
    }

    await prisma.agent.delete({
      where: { id },
    });

    return { deleted: true };
  }

  // Pause agent
  async pause(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'PAUSED' });
  }

  // Resume agent
  async resume(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'ACTIVE' });
  }

  // Get agent stats
  async getStats(id: string, companyId: string) {
    const agent = await this.getById(id, companyId);

    // Get session stats
    const [totalSessions, totalMessages] = await Promise.all([
      prisma.session.count({ where: { agentId: id } }),
      prisma.message.count({
        where: { session: { agentId: id } },
      }),
    ]);

    // Get recent messages for cost calculation
    const recentMessages = await prisma.message.findMany({
      where: {
        session: { agentId: id },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      select: {
        tokensUsed: true,
        costUsd: true,
      },
    });

    const totalTokens = recentMessages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
    const totalCost = recentMessages.reduce((sum, m) => sum + (m.costUsd || 0), 0);

    return {
      agentId: id,
      status: agent.status,
      totalSessions,
      totalMessages,
      last30Days: {
        tokens: totalTokens,
        cost: totalCost,
        messages: recentMessages.length,
      },
      storedStats: agent.stats,
    };
  }
}

export const agentsService = new AgentsService();
