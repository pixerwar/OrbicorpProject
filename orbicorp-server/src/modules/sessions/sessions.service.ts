import prisma from '../../shared/utils/prisma.js';
import { agentRuntime } from '../agent-runtime/index.js';
import { CreateSessionInput, SendMessageInput, ListSessionsQuery, ListMessagesQuery } from './sessions.schema.js';
import { Prisma } from '@prisma/client';

export class SessionsService {
  // List sessions for a user
  async list(userId: string, companyId: string, query: ListSessionsQuery) {
    const { page, limit, agentId, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {
      userId,
      agent: { companyId },
      ...(agentId && { agentId }),
      ...(status && { status }),
    };

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              department: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      prisma.session.count({ where }),
    ]);

    return {
      sessions: sessions.map(s => ({
        ...s,
        messageCount: s._count.messages,
        _count: undefined,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single session
  async getById(id: string, userId: string) {
    const session = await prisma.session.findFirst({
      where: { id, userId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            modelProvider: true,
            modelId: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    return session;
  }

  // Create new session
  async create(userId: string, companyId: string, input: CreateSessionInput) {
    // Verify agent exists and belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: input.agentId, companyId, status: 'ACTIVE' },
    });

    if (!agent) {
      throw new Error('Agent not found or not active');
    }

    const session = await prisma.session.create({
      data: {
        agentId: input.agentId,
        userId,
        channel: input.channel,
        metadata: input.metadata,
        status: 'ACTIVE',
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
          },
        },
      },
    });

    // Add system message if agent has system prompt
    if (agent.systemPrompt) {
      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'SYSTEM',
          content: agent.systemPrompt,
        },
      });
    }

    return session;
  }

  // End session
  async end(id: string, userId: string) {
    const session = await this.getById(id, userId);

    return prisma.session.update({
      where: { id },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });
  }

  // Delete session
  async delete(id: string, userId: string) {
    await this.getById(id, userId);

    await prisma.session.delete({
      where: { id },
    });

    return { deleted: true };
  }

  // Get messages for a session
  async getMessages(sessionId: string, userId: string, query: ListMessagesQuery) {
    // Verify session belongs to user
    await this.getById(sessionId, userId);

    const { limit, before } = query;

    const where: Prisma.MessageWhereInput = {
      sessionId,
      ...(before && { createdAt: { lt: new Date(before) } }),
    };

    const messages = await prisma.message.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Return in chronological order
    return messages.reverse();
  }

  // Send message and get AI response
  async sendMessage(sessionId: string, userId: string, input: SendMessageInput) {
    try {
      // Use agent runtime for real LLM calls
      const result = await agentRuntime.chat(sessionId, userId, input.content);

      return {
        userMessage: result.userMessage,
        aiMessage: result.aiMessage,
        usage: {
          tokens: result.usage,
          cost: result.cost,
        },
      };
    } catch (error) {
      // Fallback to mock if LLM fails
      console.error('LLM call failed, using mock:', error);
      return this.sendMessageMock(sessionId, userId, input);
    }
  }

  // Mock message sending (fallback when no LLM configured)
  private async sendMessageMock(sessionId: string, userId: string, input: SendMessageInput) {
    // Get session with agent details
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId, status: 'ACTIVE' },
      include: { agent: true },
    });

    if (!session) {
      throw new Error('Session not found or ended');
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        role: 'USER',
        content: input.content,
        metadata: input.metadata,
      },
    });

    // Generate mock response
    const mockResponse = this._generateMockResponse(session.agent, input.content);

    // Save AI message
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: mockResponse.content,
        tokensUsed: mockResponse.tokensUsed,
        costUsd: mockResponse.costUsd,
        metadata: {
          model: session.agent.modelId,
          provider: session.agent.modelProvider,
          mock: true,
        },
      },
    });

    return {
      userMessage,
      aiMessage,
      usage: {
        tokens: {
          input: mockResponse.inputTokens,
          output: mockResponse.outputTokens,
          total: mockResponse.tokensUsed,
        },
        cost: mockResponse.costUsd,
      },
    };
  }

  // Generate mock response (when LLM not available)
  private _generateMockResponse(agent: any, userContent: string) {
    const content = userContent.toLowerCase();
    let response: string;

    if (content.includes('merhaba') || content.includes('selam')) {
      response = `Merhaba! Ben ${agent.name}. Size nasıl yardımcı olabilirim?`;
    } else if (content.includes('teşekkür')) {
      response = 'Rica ederim! Başka bir konuda yardımcı olabilir miyim?';
    } else if (content.includes('fiyat') || content.includes('ücret')) {
      response = 'Fiyatlandırma hakkında detaylı bilgi için size özel bir teklif hazırlayabilirim.';
    } else {
      const responses = [
        'Anladım, bu konuda size yardımcı olabilirim.',
        'Tabii ki! İşte istediğiniz bilgiler...',
        'Bu sorunuzu yanıtlamak için birkaç seçenek sunabilirim.',
        'Hemen bakıyorum. Size en uygun çözümü bulacağım.',
      ];
      response = responses[Math.floor(Math.random() * responses.length)];
    }

    // Add note about mock mode
    response += '\n\n_(Not: LLM API yapılandırılmadığı için mock yanıt döndürülüyor)_';

    const inputTokens = Math.ceil(userContent.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    return {
      content: response,
      inputTokens,
      outputTokens,
      tokensUsed: inputTokens + outputTokens,
      costUsd: 0,
    };
  }

  // Update agent statistics
  private async updateAgentStats(agentId: string) {
    const [totalSessions, totalMessages] = await Promise.all([
      prisma.session.count({ where: { agentId } }),
      prisma.message.count({
        where: { session: { agentId }, role: 'ASSISTANT' },
      }),
    ]);

    const currentStats = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { stats: true },
    });

    const stats = (currentStats?.stats as any) || {};

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        stats: {
          ...stats,
          totalChats: totalSessions,
          totalMessages,
          lastActivity: new Date().toISOString(),
        },
      },
    });
  }
}

export const sessionsService = new SessionsService();
