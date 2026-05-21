import { prisma } from '../../shared/utils/prisma.js';

export class DashboardService {
  
  // Get dashboard stats for a company
  async getStats(companyId: string) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Basic agent counts
      const totalAgents = await prisma.agent.count({ where: { companyId } });
      const activeAgents = await prisma.agent.count({ where: { companyId, status: 'ACTIVE' } });
      const pausedAgents = await prisma.agent.count({ where: { companyId, status: 'PAUSED' } });

      // Task counts - current period
      const totalTasks = await prisma.task.count({ where: { companyId } });
      const completedTasks = await prisma.task.count({ where: { companyId, status: 'COMPLETED' } });
      const failedTasks = await prisma.task.count({ where: { companyId, status: 'FAILED' } });
      const pendingTasks = await prisma.task.count({ where: { companyId, status: 'PENDING' } });
      const runningTasks = await prisma.task.count({ where: { companyId, status: 'RUNNING' } });
      
      // Tasks today
      const tasksToday = await prisma.task.count({ 
        where: { companyId, createdAt: { gte: today } } 
      });
      
      // Tasks this month vs last month for change percent
      const tasksThisMonth = await prisma.task.count({ 
        where: { companyId, createdAt: { gte: thirtyDaysAgo } } 
      });
      const tasksLastMonth = await prisma.task.count({ 
        where: { 
          companyId, 
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } 
        } 
      });
      const taskChangePercent = tasksLastMonth > 0 
        ? Math.round(((tasksThisMonth - tasksLastMonth) / tasksLastMonth) * 100) 
        : (tasksThisMonth > 0 ? 100 : 0);

      // Workflow counts
      const totalWorkflows = await prisma.workflow.count({ where: { companyId } });
      const activeWorkflows = await prisma.workflow.count({ where: { companyId, status: 'ACTIVE' } });

      // Session counts - filter through agent relation
      const totalSessions = await prisma.session.count({
        where: { agent: { companyId } }
      });

      // Monthly sessions - current and previous
      const sessionsThisMonth = await prisma.session.count({
        where: { 
          agent: { companyId },
          startedAt: { gte: thirtyDaysAgo }
        }
      });
      const sessionsLastMonth = await prisma.session.count({
        where: { 
          agent: { companyId },
          startedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }
        }
      });
      const sessionChangePercent = sessionsLastMonth > 0
        ? Math.round(((sessionsThisMonth - sessionsLastMonth) / sessionsLastMonth) * 100)
        : (sessionsThisMonth > 0 ? 100 : 0);

      // Get all agents for this company to query messages
      const companyAgents = await prisma.agent.findMany({
        where: { companyId },
        select: { id: true }
      });
      const agentIds = companyAgents.map(a => a.id);

      // Monthly messages with cost data - current period
      const monthlyMessages = agentIds.length > 0 ? await prisma.message.findMany({
        where: {
          session: { agentId: { in: agentIds } },
          role: 'ASSISTANT',
          createdAt: { gte: thirtyDaysAgo }
        },
        select: {
          tokensUsed: true,
          costUsd: true,
        }
      }) : [];
      
      // Last month messages for comparison
      const lastMonthMessages = agentIds.length > 0 ? await prisma.message.count({
        where: {
          session: { agentId: { in: agentIds } },
          role: 'ASSISTANT',
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }
        }
      }) : 0;
      
      const messageChangePercent = lastMonthMessages > 0
        ? Math.round(((monthlyMessages.length - lastMonthMessages) / lastMonthMessages) * 100)
        : (monthlyMessages.length > 0 ? 100 : 0);

      // Calculate totals
      const totalMonthlyTokens = monthlyMessages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
      const totalMonthlyCost = monthlyMessages.reduce((sum, m) => sum + (m.costUsd || 0), 0);

      // Get company budget from settings
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true }
      });
      const settings = (company?.settings as any) || {};
      const monthlyBudget = settings.monthlyBudget || 2000;

      // Recent agents
      const recentAgents = await prisma.agent.findMany({
        where: { companyId },
        take: 6,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          department: true,
          status: true,
          modelProvider: true,
          modelId: true,
          stats: true,
          updatedAt: true,
        }
      });

      // Recent tasks (without relations)
      const recentTasks = await prisma.task.findMany({
        where: { companyId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          progress: true,
          createdAt: true,
          agentId: true
        }
      });

      // Get agent names separately
      const taskAgentIds = recentTasks.map(t => t.agentId).filter((id): id is string => id !== null);
      const agents = taskAgentIds.length > 0 ? await prisma.agent.findMany({
        where: { id: { in: taskAgentIds } },
        select: { id: true, name: true }
      }) : [];
      const agentMap = new Map(agents.map(a => [a.id, a.name]));

      // Calculate success rate from agent stats
      const agentStats = recentAgents.map(a => (a.stats as any) || {});
      const avgSuccessRate = agentStats.length > 0
        ? Math.round(agentStats.reduce((sum, s) => sum + (s.successRate || 100), 0) / agentStats.length)
        : 100;

      // Pending approvals
      const pendingApprovals = await prisma.notification.count({
        where: {
          companyId,
          status: 'PENDING',
          type: 'APPROVAL'
        }
      });

      return {
        summary: {
          totalAgents,
          activeAgents,
          pausedAgents,
          totalTasks,
          tasksToday,
          tasksThisMonth,
          taskChangePercent,
          successRate: avgSuccessRate,
          pendingApprovals,
          totalWorkflows,
          activeWorkflows,
          sessionsThisMonth,
          sessionChangePercent,
          messagesThisMonth: monthlyMessages.length,
          messageChangePercent,
          totalMonthlyTokens,
          estimatedMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
          monthlyBudget,
        },
        tasksByStatus: {
          pending: pendingTasks,
          running: runningTasks,
          completed: completedTasks,
          failed: failedTasks,
          approval: pendingApprovals,
        },
        recentAgents: recentAgents.map(a => ({
          ...a,
          stats: (a.stats as object) || {},
        })),
        recentTasks: recentTasks.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
          agentName: t.agentId ? (agentMap.get(t.agentId) || 'Unknown') : 'System',
          createdAt: t.createdAt,
        })),
      };
    } catch (error) {
      console.error('Dashboard getStats error:', error);
      throw error;
    }
  }

  // Get activity chart data
  async getActivityChart(companyId: string) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all agents for this company
      const companyAgents = await prisma.agent.findMany({
        where: { companyId },
        select: { id: true }
      });
      const agentIds = companyAgents.map(a => a.id);
      
      if (agentIds.length === 0) return [];

      // Get messages grouped by date
      const messages = await prisma.message.findMany({
        where: {
          session: { agentId: { in: agentIds } },
          createdAt: { gte: thirtyDaysAgo }
        },
        select: {
          createdAt: true,
          role: true,
        },
        orderBy: { createdAt: 'asc' }
      });

      // Group by date
      const dailyData: Record<string, { messages: number; sessions: number }> = {};
      
      for (const msg of messages) {
        const dateKey = msg.createdAt.toISOString().split('T')[0];
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = { messages: 0, sessions: 0 };
        }
        dailyData[dateKey].messages++;
      }

      // Get sessions grouped by date
      const sessions = await prisma.session.findMany({
        where: {
          agentId: { in: agentIds },
          startedAt: { gte: thirtyDaysAgo }
        },
        select: { startedAt: true }
      });

      for (const session of sessions) {
        const dateKey = session.startedAt.toISOString().split('T')[0];
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = { messages: 0, sessions: 0 };
        }
        dailyData[dateKey].sessions++;
      }

      // Convert to array and fill missing dates
      const result = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const data = dailyData[dateKey] || { messages: 0, sessions: 0 };
        result.push({
          date: dateKey,
          label: date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
          ...data
        });
      }

      return result;
    } catch (error) {
      console.error('Activity chart error:', error);
      return [];
    }
  }

  // Get top performing agents
  async getTopAgents(companyId: string, limit: number = 5) {
    const agents = await prisma.agent.findMany({
      where: { companyId, status: 'ACTIVE' },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        department: true,
        stats: true,
      }
    });

    return agents.map(a => {
      const stats = (a.stats as any) || {};
      return {
        id: a.id,
        name: a.name,
        department: a.department,
        totalChats: stats.totalChats || 0,
        monthlyTokens: stats.monthlyTokens || 0,
        monthlyCost: stats.monthlyCost || 0,
        successRate: stats.successRate || 100,
        avgResponseTime: stats.avgResponseTime || '—',
      };
    });
  }

  // Get model usage breakdown
  async getModelUsage(companyId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get all agents for this company
    const companyAgents = await prisma.agent.findMany({
      where: { companyId },
      select: { id: true, modelProvider: true, modelId: true }
    });
    const agentIds = companyAgents.map(a => a.id);

    if (agentIds.length === 0) {
      return [];
    }

    // Get messages with metadata
    const messages = await prisma.message.findMany({
      where: {
        session: { agentId: { in: agentIds } },
        role: 'ASSISTANT',
        createdAt: { gte: thirtyDaysAgo }
      },
      select: {
        tokensUsed: true,
        costUsd: true,
        metadata: true,
      }
    });

    // Group by provider/model
    const usageByModel: Record<string, { tokens: number; cost: number; count: number }> = {};

    for (const msg of messages) {
      const meta = msg.metadata as any;
      const provider = meta?.provider || 'unknown';
      const model = meta?.model || 'unknown';
      const key = `${provider}/${model}`;

      if (!usageByModel[key]) {
        usageByModel[key] = { tokens: 0, cost: 0, count: 0 };
      }

      usageByModel[key].tokens += msg.tokensUsed || 0;
      usageByModel[key].cost += msg.costUsd || 0;
      usageByModel[key].count += 1;
    }

    // Convert to array and sort by cost
    return Object.entries(usageByModel)
      .map(([key, data]) => {
        const [provider, model] = key.split('/');
        return {
          provider,
          model,
          displayName: getModelDisplayName(provider, model),
          tokens: data.tokens,
          cost: Math.round(data.cost * 100) / 100,
          messageCount: data.count,
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }
}

// Helper to get friendly model names
function getModelDisplayName(provider: string, model: string): string {
  const modelNames: Record<string, string> = {
    'claude-sonnet-4-20250514': 'Claude Sonnet 4',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
    'claude-3-haiku-20240307': 'Claude 3 Haiku',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
  };

  return modelNames[model] || model;
}

export const dashboardService = new DashboardService();
