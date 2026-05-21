import prisma from '../../shared/utils/prisma.js';
import { llmManager } from './llm-manager.js';
import { LLMMessage, StreamChunk, TextContent, ImageContent, AGENT_TOOLS, ToolUse } from './llm-types.js';
import { fileProcessor, FileAttachment } from './file-processor.js';
import { packageRuntime } from '../market/package-runtime.service.js';  // [NEW] Paket runtime import

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  attachments?: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    url: string;
  }>;
}

export interface ChatResult {
  sessionId: string;
  userMessage: {
    id: string;
    content: string;
    createdAt: Date;
  };
  aiMessage: {
    id: string;
    content: string;
    createdAt: Date;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
  model: string;
  provider: string;
  latency: number;
}

export class AgentRuntimeService {
  // Send message and get response (non-streaming)
  async chat(
    sessionId: string,
    userId: string,
    content: string,
    options: ChatOptions = {}
  ): Promise<ChatResult> {
    // Get session with agent
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId, status: 'ACTIVE' },
      include: { agent: true },
    });

    if (!session) {
      throw new Error('Session not found or not active');
    }

    const { agent } = session;

    if (agent.status !== 'ACTIVE') {
      throw new Error('Agent is not active');
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        role: 'USER',
        content,
      },
    });

    // Build conversation history with provider info
    const history = await this.buildConversationHistory(
      sessionId, 
      agent.systemPrompt, 
      undefined, 
      agent.modelProvider || undefined, 
      agent.modelId || undefined
    );

    // Call LLM
    const response = await llmManager.chatWithProvider(
      agent.modelProvider,
      history,
      {
        model: agent.modelId,
        maxTokens: options.maxTokens || agent.maxTokens,
        temperature: options.temperature ?? agent.temperature,
        systemPrompt: agent.systemPrompt || undefined,
      }
    );

    if (!response.success) {
      // Save error message
      await prisma.message.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `Üzgünüm, bir hata oluştu: ${response.error}`,
          metadata: { error: response.error },
        },
      });
      throw new Error(response.error || 'LLM call failed');
    }

    // Save AI message
    const aiMessage = await prisma.message.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: response.content,
        tokensUsed: response.usage.totalTokens,
        costUsd: response.cost.total,
        metadata: {
          model: response.model,
          provider: response.provider,
          usage: response.usage,
          latency: response.latency,
        },
      },
    });

    // Update agent stats
    await this.updateAgentStats(agent.id);

    return {
      sessionId,
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      aiMessage: {
        id: aiMessage.id,
        content: aiMessage.content,
        createdAt: aiMessage.createdAt,
      },
      usage: response.usage,
      cost: response.cost.total,
      model: response.model,
      provider: response.provider,
      latency: response.latency,
    };
  }

  // Streaming chat
  async *chatStream(
    sessionId: string,
    userId: string,
    content: string,
    options: ChatOptions = {}
  ): AsyncGenerator<StreamChunk & { messageId?: string }> {
    // Get session with agent and company
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId, status: 'ACTIVE' },
      include: { 
        agent: {
          include: { company: true }
        }
      },
    });

    if (!session) {
      yield { type: 'error', error: 'Session not found or not active' };
      return;
    }

    const { agent } = session;

    // Debug log
    console.log('Agent info:', {
      id: agent.id,
      name: agent.name,
      systemPrompt: agent.systemPrompt ? agent.systemPrompt.substring(0, 100) + '...' : 'NULL',
      modelProvider: agent.modelProvider,
      modelId: agent.modelId,
    });

    if (agent.status !== 'ACTIVE') {
      yield { type: 'error', error: 'Agent is not active' };
      return;
    }

    // Determine provider and model - use agent's config or fall back to company's default
    let provider = agent.modelProvider;
    let model = agent.modelId;

    // Get company's LLM config
    const llmConfig = agent.company.llmConfig as Record<string, string> || {};

    if (!provider || !model) {
      const configuredProviders = Object.keys(llmConfig).filter(k => llmConfig[k]);
      
      if (configuredProviders.length === 0) {
        yield { type: 'error', error: 'LLM yapılandırması bulunamadı. Ayarlar sayfasından API anahtarı ekleyin.' };
        return;
      }

      // Use first configured provider
      provider = configuredProviders[0];
      
      // Set default model for provider
      const defaultModels: Record<string, string> = {
        anthropic: 'claude-sonnet-4-20250514',
        openai: 'gpt-4o',
        google: 'gemini-1.5-pro',
        openrouter: 'anthropic/claude-3.5-sonnet',
      };
      model = defaultModels[provider] || 'claude-sonnet-4-20250514';
    }

    // Initialize provider with API key from company config if not already initialized
    if (!llmManager.hasProvider(provider)) {
      const apiKey = llmConfig[provider];
      if (!apiKey) {
        yield { type: 'error', error: `${provider} için API anahtarı yapılandırılmamış. Ayarlar sayfasından ekleyin.` };
        return;
      }
      llmManager.initializeProvider(provider, apiKey);
    }

    // Process attachments
    const attachments = options.attachments || [];
    let processedFiles: Awaited<ReturnType<typeof fileProcessor.processAttachments>> = [];
    
    if (attachments.length > 0) {
      console.log('Processing attachments:', attachments.map(a => a.originalName));
      processedFiles = await fileProcessor.processAttachments(attachments as FileAttachment[]);
      console.log('Processed files:', processedFiles.map(f => ({ type: f.type, name: f.originalName })));
    }

    // Build multimodal user message content
    const userMessageContent: (TextContent | ImageContent)[] = [];
    
    // Add text content first
    if (content.trim()) {
      userMessageContent.push({ type: 'text', text: content });
    }
    
    // Add processed files
    for (const file of processedFiles) {
      if (file.type === 'image' && file.content.type === 'image') {
        userMessageContent.push(file.content as ImageContent);
      } else if (file.content.type === 'text') {
        userMessageContent.push(file.content as TextContent);
      } else if (file.content.type === 'document' && 'extractedText' in file.content) {
        // For documents, add extracted text if available
        userMessageContent.push({
          type: 'text',
          text: `📄 ${file.originalName}:\n${file.content.extractedText || '[İçerik çıkarılamadı]'}`,
        });
      }
    }

    // Fallback to text-only if no content
    const finalContent = userMessageContent.length > 0 
      ? userMessageContent 
      : [{ type: 'text' as const, text: content || '[Boş mesaj]' }];

    // Save user message with attachments (store original text for display)
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        role: 'USER',
        content: content,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : '[]',
      },
    });

    // Build conversation history with multimodal support and provider info
    const history = await this.buildConversationHistory(sessionId, agent.systemPrompt, finalContent, provider, model);

    // Debug log
    console.log('Conversation history:', history.length, 'messages');
    const systemContent = history.find(m => m.role === 'system')?.content;
    console.log('System prompt in history:', typeof systemContent === 'string' ? systemContent.substring(0, 100) : 'MULTIMODAL');
    console.log('Last message content types:', Array.isArray(finalContent) ? finalContent.map(c => c.type) : 'text-only');

    let streamedContent = '';
    let finalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let finalCost = { input: 0, output: 0, total: 0 };
    let pendingToolUse: ToolUse | null = null;

    // [NEW] Agent için paket tool'larını yükle
    const packageContext = await packageRuntime.getAgentPackageContext(agent.id);
    
    // [NEW] Builtin tool'lar + paket tool'larını birleştir
    const allTools = [...AGENT_TOOLS, ...packageContext.tools];
    
    console.log('[AgentRuntime] Toplam tool sayısı:', allTools.length);
    console.log('[AgentRuntime] Paket tool\'ları:', packageContext.tools.map(t => t.name));

    // Stream from LLM with tools
    for await (const chunk of llmManager.chatStream(history, {
      provider,
      model,
      maxTokens: options.maxTokens || agent.maxTokens,
      temperature: options.temperature ?? agent.temperature,
      systemPrompt: agent.systemPrompt || undefined,
      tools: allTools,  // [CHANGED] Dinamik tool listesi
    })) {
      if (chunk.type === 'chunk' && chunk.content) {
        streamedContent += chunk.content;
      }
      
      // Handle tool use
      if (chunk.type === 'tool_use' && chunk.tool_use) {
        pendingToolUse = chunk.tool_use;
        
        // Execute the tool
        const toolResult = await this.executeAgentTool(
          chunk.tool_use,
          agent.companyId,
          agent.id,
          userId
        );
        
        // Yield tool execution info to frontend
        yield { 
          type: 'chunk', 
          content: `\n\n🔧 *${this.getToolDisplayName(chunk.tool_use.name)}*\n${toolResult.message}\n\n`
        };
        streamedContent += `\n\n🔧 *${this.getToolDisplayName(chunk.tool_use.name)}*\n${toolResult.message}\n\n`;
      }
      
      if (chunk.type === 'done') {
        finalUsage = chunk.usage || finalUsage;
        finalCost = chunk.cost || finalCost;
      }

      // Don't yield tool_use chunks to frontend, we handle them above
      if (chunk.type !== 'tool_use') {
        yield chunk;
      }
    }

    // Save AI message after streaming completes
    if (streamedContent) {
      const aiMessage = await prisma.message.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: streamedContent,
          tokensUsed: finalUsage.totalTokens,
          costUsd: finalCost.total,
          metadata: {
            model,
            provider,
            usage: finalUsage,
            streamed: true,
          },
        },
      });

      // Update agent stats
      await this.updateAgentStats(agent.id);

      // Yield message ID at the end
      yield { type: 'done', messageId: aiMessage.id, usage: finalUsage, cost: finalCost };
    }
  }

  // Get technology info based on provider
  private getTechnologyInfo(provider: string, model: string): string {
    const techMap: Record<string, string> = {
      'anthropic': 'Claude',
      'openai': 'GPT',
      'google': 'Gemini',
    };

    // OpenRouter için model adından çıkar
    if (provider === 'openrouter') {
      if (model.includes('claude')) return 'Claude';
      if (model.includes('gpt')) return 'GPT';
      if (model.includes('gemini')) return 'Gemini';
      if (model.includes('llama')) return 'Llama';
      if (model.includes('mistral')) return 'Mistral';
      if (model.includes('qwen')) return 'Qwen';
      // Fallback: model adının ilk kısmını kullan
      const modelName = model.split('/').pop()?.split('-')[0] || 'AI';
      return modelName.charAt(0).toUpperCase() + modelName.slice(1);
    }

    return techMap[provider] || 'AI';
  }

  // Build conversation history for LLM
  private async buildConversationHistory(
    sessionId: string,
    systemPrompt: string | null,
    currentMessageContent?: (TextContent | ImageContent)[],
    provider?: string,
    model?: string
  ): Promise<LLMMessage[]> {
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 50, // Limit context
    });

    // Get session to find agent and company
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: true },
    });

    const history: LLMMessage[] = [];

    // Add system prompt with technology info and active tasks
    if (systemPrompt) {
      let finalPrompt = systemPrompt;
      
      // Add technology disclosure if provider info is available
      if (provider && model) {
        const techName = this.getTechnologyInfo(provider, model);
        finalPrompt += `\n\n[Teknoloji bilgisi: ${techName} teknolojisi ile çalışıyorsun. Kimliğin sorulduğunda bunu belirtebilirsin.]`;
      }
      
      // Add active tasks context
      if (session?.agent?.companyId) {
        const taskContext = await this.buildTaskContext(session.agent.companyId, session.agent.id);
        if (taskContext) {
          finalPrompt += taskContext;
        }
      }
      
      // [NEW] Paket system prompt eklerini ekle
      if (session?.agent?.id) {
        const promptAdditions = await packageRuntime.getSystemPromptAdditions(session.agent.id);
        if (promptAdditions.length > 0) {
          finalPrompt += '\n\n--- YETENEKLERİN ---\n' + promptAdditions.join('\n\n');
          console.log('[AgentRuntime] Prompt ekleri yüklendi:', promptAdditions.length);
        }
      }
      
      history.push({ role: 'system', content: finalPrompt });
    }

    // Add conversation messages (excluding the last user message which we'll add with multimodal content)
    // We skip the last message if currentMessageContent is provided (it's the current message being processed)
    const messagesToProcess = currentMessageContent ? messages.slice(0, -1) : messages;
    
    for (const msg of messagesToProcess) {
      if (msg.role === 'SYSTEM') continue; // Skip system messages in history
      
      history.push({
        role: msg.role === 'USER' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    // Add current message with multimodal content if provided
    if (currentMessageContent && currentMessageContent.length > 0) {
      history.push({
        role: 'user',
        content: currentMessageContent,
      });
    }

    return history;
  }

  // Build task context for system prompt
  private async buildTaskContext(companyId: string, agentId: string): Promise<string | null> {
    try {
      // Get active and recent tasks for this agent/company
      const tasks = await prisma.task.findMany({
        where: {
          companyId,
          OR: [
            { agentId }, // Tasks assigned to this agent
            { status: { in: ['RUNNING', 'APPROVAL', 'PENDING'] } }, // Active tasks from any agent
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          workflow: { select: { name: true } },
        },
      });

      if (tasks.length === 0) {
        return null;
      }

      // Format task context
      const priorityLabels: Record<string, string> = {
        CRITICAL: '🔴 Kritik',
        HIGH: '🟠 Yüksek',
        MEDIUM: '🟡 Orta',
        LOW: '🟢 Düşük',
      };

      const statusLabels: Record<string, string> = {
        RUNNING: '▶️ Çalışıyor',
        APPROVAL: '⏸️ Onay Bekliyor',
        PENDING: '⏳ Beklemede',
        COMPLETED: '✅ Tamamlandı',
        FAILED: '❌ Hata',
        CANCELLED: '🚫 İptal',
      };

      let context = '\n\n[AKTİF GÖREVLER]\n';
      context += 'Şu anda şirket için aktif olan görevler:\n\n';

      for (const task of tasks) {
        const priority = priorityLabels[task.priority] || task.priority;
        const status = statusLabels[task.status] || task.status;
        const isMyTask = task.agentId === agentId;
        
        context += `${isMyTask ? '👉 ' : ''}**${task.name}**\n`;
        context += `   Durum: ${status} | Öncelik: ${priority} | İlerleme: ${task.progress}%\n`;
        
        if (task.description) {
          context += `   Açıklama: ${task.description}\n`;
        }
        
        if (task.workflow) {
          context += `   Workflow: ${task.workflow.name}\n`;
        }

        // Add recent logs if available
        const logs = task.logs as Array<{ timestamp: string; message: string }> | null;
        if (logs && logs.length > 0) {
          const recentLog = logs[logs.length - 1];
          context += `   Son log: ${recentLog.message}\n`;
        }

        context += '\n';
      }

      context += 'Kullanıcı bu görevler hakkında soru sorabilir. Görev durumları hakkında bilgi verebilir, onay bekleyen görevler için detay sağlayabilirsin.\n';
      context += '\nGörev oluşturmak, listelemek veya güncellemek için sana verilen araçları (tools) kullanabilirsin.\n';

      return context;
    } catch (error) {
      console.error('Error building task context:', error);
      return null;
    }
  }

  // Get display name for tool
  private getToolDisplayName(toolName: string): string {
    const names: Record<string, string> = {
      create_task: 'Görev Oluşturuluyor',
      list_tasks: 'Görevler Listeleniyor',
      update_task: 'Görev Güncelleniyor',
      remember: 'Hafızaya Kaydediliyor',
      recall: 'Hafızadan Getiriliyor',
      forget: 'Hafızadan Siliniyor',
      list_agents: 'Agent\'lar Listeleniyor',
      create_agent: 'Agent Oluşturuluyor',
      ask_agent: 'Agent\'a Soruluyor',
      delegate_task: 'Görev Devrediliyor',
      calculate: 'Hesaplanıyor',
      web_search: 'Web\'de Aranıyor',
    };
    return names[toolName] || toolName;
  }

  // Execute agent tool and return result
  private async executeAgentTool(
    toolUse: ToolUse,
    companyId: string,
    agentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const { name, input } = toolUse;

    try {
      switch (name) {
        case 'create_task': {
          const task = await prisma.task.create({
            data: {
              companyId,
              agentId,
              name: input.name,
              description: input.description || '',
              priority: input.priority || 'MEDIUM',
              status: 'PENDING',
              progress: 0,
              steps: [],
              logs: [
                {
                  timestamp: new Date().toISOString(),
                  level: 'info',
                  message: `Görev oluşturuldu (Agent tarafından)`,
                },
              ],
            },
          });
          
          return {
            success: true,
            message: `✅ Görev oluşturuldu: "${task.name}" (ID: ${task.id.slice(-8)})\nÖncelik: ${task.priority}\nDurum: Beklemede`,
            data: task,
          };
        }

        case 'list_tasks': {
          const tasks = await prisma.task.findMany({
            where: {
              companyId,
              ...(input.status && { status: input.status }),
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });

          if (tasks.length === 0) {
            return {
              success: true,
              message: '📋 Aktif görev bulunamadı.',
              data: [],
            };
          }

          const statusEmoji: Record<string, string> = {
            RUNNING: '▶️',
            PENDING: '⏳',
            APPROVAL: '⏸️',
            COMPLETED: '✅',
            FAILED: '❌',
            CANCELLED: '🚫',
          };

          const taskList = tasks.map(t => 
            `${statusEmoji[t.status] || '•'} ${t.name} (${t.progress}%)`
          ).join('\n');

          return {
            success: true,
            message: `📋 **Görevler (${tasks.length}):**\n${taskList}`,
            data: tasks,
          };
        }

        case 'update_task': {
          const task = await prisma.task.findFirst({
            where: { id: input.task_id, companyId },
          });

          if (!task) {
            return {
              success: false,
              message: `❌ Görev bulunamadı: ${input.task_id}`,
            };
          }

          const updates: any = {};
          const messages: string[] = [];

          if (input.progress !== undefined) {
            updates.progress = Math.min(100, Math.max(0, input.progress));
            messages.push(`İlerleme: ${updates.progress}%`);
          }

          if (input.status) {
            updates.status = input.status;
            messages.push(`Durum: ${input.status}`);
            
            if (input.status === 'COMPLETED') {
              updates.progress = 100;
              updates.completedAt = new Date();
            }
          }

          if (input.log_message) {
            const currentLogs = (task.logs as any[]) || [];
            updates.logs = [
              ...currentLogs,
              {
                timestamp: new Date().toISOString(),
                level: 'info',
                message: input.log_message,
              },
            ];
            messages.push(`Log eklendi: "${input.log_message}"`);
          }

          await prisma.task.update({
            where: { id: input.task_id },
            data: updates,
          });

          return {
            success: true,
            message: `✅ Görev güncellendi: "${task.name}"\n${messages.join('\n')}`,
          };
        }

        // ==========================================
        // MEMORY TOOLS
        // ==========================================

        case 'remember': {
          const memoryType = input.type?.toUpperCase() || 'FACT';
          
          // Validate memory type
          if (!['FACT', 'PREFERENCE', 'LEARNING'].includes(memoryType)) {
            return {
              success: false,
              message: `❌ Geçersiz hafıza türü: ${input.type}. Geçerli türler: fact, preference, learning`,
            };
          }

          const memory = await prisma.agentMemory.create({
            data: {
              agentId,
              type: memoryType as 'FACT' | 'PREFERENCE' | 'LEARNING',
              content: input.content,
              metadata: {
                createdBy: userId,
                context: 'chat',
              },
            },
          });

          const typeLabels: Record<string, string> = {
            FACT: '📌 Gerçek',
            PREFERENCE: '💡 Tercih',
            LEARNING: '🎓 Öğrenme',
          };

          return {
            success: true,
            message: `✅ Hafızaya kaydedildi\n${typeLabels[memoryType]}: "${input.content}"\nID: ${memory.id.slice(-8)}`,
            data: memory,
          };
        }

        case 'recall': {
          const query = input.query?.toLowerCase() || '';
          const memoryType = input.type?.toUpperCase();

          // Build where clause
          const whereClause: any = { agentId };
          if (memoryType && ['FACT', 'PREFERENCE', 'LEARNING'].includes(memoryType)) {
            whereClause.type = memoryType;
          }

          // Get all memories for this agent (simple text search)
          const memories = await prisma.agentMemory.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 50,
          });

          // Filter by query (simple contains search)
          const matchedMemories = memories.filter(m => 
            m.content.toLowerCase().includes(query)
          ).slice(0, 10);

          if (matchedMemories.length === 0) {
            return {
              success: true,
              message: `🔍 "${input.query}" ile ilgili hafızada kayıt bulunamadı.`,
              data: [],
            };
          }

          const typeEmoji: Record<string, string> = {
            FACT: '📌',
            PREFERENCE: '💡',
            LEARNING: '🎓',
          };

          const memoryList = matchedMemories.map(m => 
            `${typeEmoji[m.type] || '•'} ${m.content} (${m.id.slice(-8)})`
          ).join('\n');

          return {
            success: true,
            message: `🔍 **Hafızada bulunanlar (${matchedMemories.length}):**\n${memoryList}`,
            data: matchedMemories,
          };
        }

        case 'forget': {
          const memory = await prisma.agentMemory.findFirst({
            where: { id: input.memory_id, agentId },
          });

          if (!memory) {
            return {
              success: false,
              message: `❌ Hafıza kaydı bulunamadı: ${input.memory_id}`,
            };
          }

          await prisma.agentMemory.delete({
            where: { id: input.memory_id },
          });

          return {
            success: true,
            message: `🗑️ Hafızadan silindi: "${memory.content.slice(0, 50)}${memory.content.length > 50 ? '...' : ''}"${input.reason ? `\nNeden: ${input.reason}` : ''}`,
          };
        }

        // ==========================================
        // MULTI-AGENT TOOLS
        // ==========================================

        case 'list_agents': {
          const whereClause: any = { companyId };
          if (input.status) {
            whereClause.status = input.status;
          }

          const agents = await prisma.agent.findMany({
            where: whereClause,
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              department: true,
              status: true,
              isMain: true,
            },
          });

          if (agents.length === 0) {
            return {
              success: true,
              message: '🤖 Başka agent bulunamadı.',
              data: [],
            };
          }

          const agentList = agents.map(a => {
            const statusEmoji = a.status === 'ACTIVE' ? '🟢' : '🔴';
            const mainBadge = a.isMain ? ' ⭐' : '';
            const dept = a.department ? ` (${a.department})` : '';
            return `${statusEmoji}${mainBadge} **${a.name}**${dept}\n   ${a.description || 'Açıklama yok'}\n   ID: ${a.id.slice(-8)}`;
          }).join('\n\n');

          return {
            success: true,
            message: `🤖 **Agent'lar (${agents.length}):**\n\n${agentList}`,
            data: agents,
          };
        }

        case 'create_agent': {
          // Check if current agent is Main Agent
          const currentAgent = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { isMain: true },
          });

          if (!currentAgent?.isMain) {
            return {
              success: false,
              message: '❌ Sadece Main Agent yeni agent oluşturabilir.',
            };
          }

          const newAgent = await prisma.agent.create({
            data: {
              companyId,
              name: input.name,
              description: input.description,
              department: input.department || null,
              systemPrompt: input.system_prompt,
              skills: input.skills ? input.skills.split(',').map((s: string) => s.trim()) : [],
              status: 'ACTIVE',
              isMain: false,
              temperature: 0.7,
              maxTokens: 2000,
            },
          });

          return {
            success: true,
            message: `✅ Yeni agent oluşturuldu!\n🤖 **${newAgent.name}**\n${newAgent.description}\nDepartman: ${newAgent.department || 'Genel'}\nID: ${newAgent.id.slice(-8)}`,
            data: newAgent,
          };
        }

        case 'ask_agent': {
          // Find target agent
          const targetAgent = await prisma.agent.findFirst({
            where: {
              companyId,
              OR: [
                { id: input.agent_id },
                { id: { endsWith: input.agent_id } },
              ],
            },
          });

          if (!targetAgent) {
            return {
              success: false,
              message: `❌ Agent bulunamadı: ${input.agent_id}`,
            };
          }

          if (targetAgent.status !== 'ACTIVE') {
            return {
              success: false,
              message: `❌ ${targetAgent.name} şu anda aktif değil.`,
            };
          }

          // Build question with context
          let fullQuestion = input.question;
          if (input.context) {
            fullQuestion = `Bağlam: ${input.context}\n\nSoru: ${input.question}`;
          }

          try {
            // Ask the agent directly
            const response = await this.askAgentDirectly(targetAgent, fullQuestion, companyId);
            
            return {
              success: true,
              message: `💬 **${targetAgent.name}** cevaplıyor:\n\n${response}`,
              data: { agentId: targetAgent.id, agentName: targetAgent.name, response },
            };
          } catch (error) {
            return {
              success: false,
              message: `❌ ${targetAgent.name} ile iletişim kurulamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
            };
          }
        }

        case 'delegate_task': {
          // Find target agent
          const targetAgent = await prisma.agent.findFirst({
            where: {
              companyId,
              OR: [
                { id: input.agent_id },
                { id: { endsWith: input.agent_id } },
              ],
            },
          });

          if (!targetAgent) {
            return {
              success: false,
              message: `❌ Agent bulunamadı: ${input.agent_id}`,
            };
          }

          // Create task assigned to target agent
          const task = await prisma.task.create({
            data: {
              companyId,
              agentId: targetAgent.id,
              name: input.task_name,
              description: input.task_description + (input.context ? `\n\nBağlam: ${input.context}` : ''),
              priority: input.priority || 'MEDIUM',
              status: 'PENDING',
              progress: 0,
              steps: [],
              logs: [
                {
                  timestamp: new Date().toISOString(),
                  level: 'info',
                  message: `Görev ${agentId.slice(-8)} ID'li agent tarafından devredildi`,
                },
              ],
              metadata: {
                delegatedFrom: agentId,
                delegatedAt: new Date().toISOString(),
              },
            },
          });

          return {
            success: true,
            message: `✅ Görev "${targetAgent.name}" agent'ına devredildi\n📋 ${task.name}\nÖncelik: ${task.priority}\nID: ${task.id.slice(-8)}`,
            data: { task, targetAgent: { id: targetAgent.id, name: targetAgent.name } },
          };
        }

        // ==========================================
        // CALCULATOR TOOL (from package)
        // ==========================================

        case 'calculate': {
          try {
            // Simple expression parser (safe eval alternative)
            const expression = input.expression;
            
            // Replace common functions
            let expr = expression
              .replace(/sqrt\(/gi, 'Math.sqrt(')
              .replace(/pow\(/gi, 'Math.pow(')
              .replace(/abs\(/gi, 'Math.abs(')
              .replace(/sin\(/gi, 'Math.sin(')
              .replace(/cos\(/gi, 'Math.cos(')
              .replace(/tan\(/gi, 'Math.tan(')
              .replace(/log\(/gi, 'Math.log(')
              .replace(/\^/g, '**')
              .replace(/(\d+)%\s*of\s*(\d+)/gi, '($1/100)*$2')
              .replace(/(\d+)%/g, '($1/100)');

            // Validate - only allow safe characters
            if (!/^[\d\s+\-*/.()Math,sqrt pow abs sin cos tan log]+$/i.test(expr)) {
              return {
                success: false,
                message: `❌ Geçersiz ifade: ${expression}`,
              };
            }

            // Safe eval using Function constructor
            const result = new Function(`return ${expr}`)();
            
            return {
              success: true,
              message: `🧮 ${expression} = **${result}**`,
              data: { expression, result },
            };
          } catch (error) {
            return {
              success: false,
              message: `❌ Hesaplama hatası: ${input.expression}`,
            };
          }
        }

        // ==========================================
        // DEFAULT - Paket tool'larını kontrol et
        // ==========================================

        default: {
          // [NEW] Paket tool'larını kontrol et
          const toolPackage = await packageRuntime.findToolPackage(agentId, name);
          
          if (toolPackage) {
            console.log(`[AgentRuntime] Paket tool bulundu: ${name} -> ${toolPackage.packageName}`);
            
            // Builtin handler
            if (toolPackage.handler.startsWith('builtin:')) {
              const parsed = packageRuntime.parseBuiltinHandler(toolPackage.handler);
              
              if (parsed) {
                console.log(`[AgentRuntime] Builtin handler: ${parsed.category}.${parsed.action}`);
                // Mevcut switch-case yapısı builtin tool'ları zaten karşılıyor
                // Bu noktaya geldiyse tool tanınmamış demektir
              }
            }
            
            // Custom handler (ileride plugin sistemi için)
            if (toolPackage.handler.startsWith('custom:')) {
              console.log(`[AgentRuntime] Custom handler: ${toolPackage.handler}`);
              return {
                success: false,
                message: `⚠️ Custom tool handler henüz desteklenmiyor: ${name}`,
              };
            }
          }
          
          return {
            success: false,
            message: `❌ Bilinmeyen araç: ${name}`,
          };
        }
      }
    } catch (error) {
      console.error('Tool execution error:', error);
      return {
        success: false,
        message: `❌ Araç hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
      };
    }
  }

  // Ask another agent directly (for multi-agent communication)
  private async askAgentDirectly(
    agent: { id: string; modelProvider: string | null; modelId: string | null; systemPrompt: string | null; maxTokens: number; temperature: number; companyId: string },
    question: string,
    companyId: string
  ): Promise<string> {
    // Get company LLM config
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { llmConfig: true },
    });

    const llmConfig = (company?.llmConfig as Record<string, string>) || {};
    
    // Determine provider
    let provider = agent.modelProvider;
    let model = agent.modelId;

    if (!provider) {
      const configuredProviders = Object.keys(llmConfig).filter(
        key => !key.endsWith('Models') && llmConfig[key]
      );
      if (configuredProviders.length === 0) {
        throw new Error('LLM yapılandırılmamış');
      }
      provider = configuredProviders[0];
      const defaultModels: Record<string, string> = {
        anthropic: 'claude-sonnet-4-20250514',
        openai: 'gpt-4o',
        google: 'gemini-1.5-pro',
        openrouter: 'anthropic/claude-3.5-sonnet',
      };
      model = defaultModels[provider] || 'claude-sonnet-4-20250514';
    }

    // Initialize provider if needed
    if (!llmManager.hasProvider(provider)) {
      const apiKey = llmConfig[provider];
      if (!apiKey) {
        throw new Error(`${provider} API anahtarı yok`);
      }
      llmManager.initializeProvider(provider, apiKey);
    }

    // Build simple message for agent
    const messages: LLMMessage[] = [];
    
    if (agent.systemPrompt) {
      messages.push({
        role: 'system',
        content: agent.systemPrompt + '\n\n[Bu soru başka bir agent tarafından soruluyor. Kısa ve öz cevap ver.]',
      });
    }
    
    messages.push({
      role: 'user',
      content: question,
    });

    // Call LLM (non-streaming for simplicity)
    const response = await llmManager.chatWithProvider(provider, messages, {
      model: model || undefined,
      maxTokens: Math.min(agent.maxTokens, 500), // Limit response for inter-agent
      temperature: agent.temperature,
    });

    if (!response.success) {
      throw new Error(response.error || 'LLM hatası');
    }

    return response.content;
  }

  // Update agent statistics
  private async updateAgentStats(agentId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [totalSessions, recentMessages, recentSessions] = await Promise.all([
      prisma.session.count({ where: { agentId } }),
      prisma.message.findMany({
        where: {
          session: { agentId },
          role: 'ASSISTANT',
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { 
          tokensUsed: true, 
          costUsd: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.session.findMany({
        where: { 
          agentId,
          startedAt: { gte: thirtyDaysAgo },
        },
        select: {
          id: true,
          status: true,
          messages: {
            select: {
              role: true,
              metadata: true,
            },
            where: { role: 'ASSISTANT' },
            take: 1,
          },
        },
      }),
    ]);

    // Calculate totals
    const totalTokens = recentMessages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
    const totalCost = recentMessages.reduce((sum, m) => sum + (m.costUsd || 0), 0);

    // Calculate average response time (from metadata.latency)
    const latencies = recentMessages
      .map(m => {
        const meta = m.metadata as any;
        return meta?.latency || 0;
      })
      .filter(l => l > 0);
    
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;
    
    // Format avg response time
    const avgResponseTime = avgLatency > 0 
      ? (avgLatency / 1000).toFixed(1) + 's'
      : '—';

    // Calculate success rate based on sessions that have at least one assistant response
    // A session is "successful" if it has at least one assistant message without error
    let successfulSessions = 0;
    let totalSessionsWithResponses = 0;

    for (const session of recentSessions) {
      if (session.messages.length > 0) {
        totalSessionsWithResponses++;
        const hasError = session.messages.some(m => {
          const meta = m.metadata as any;
          return meta?.error;
        });
        if (!hasError) {
          successfulSessions++;
        }
      }
    }

    const successRate = totalSessionsWithResponses > 0
      ? Math.round((successfulSessions / totalSessionsWithResponses) * 100)
      : 100; // Default to 100% if no sessions

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        stats: {
          totalChats: totalSessions,
          totalMessages: recentMessages.length,
          monthlyTokens: totalTokens,
          monthlyCost: Math.round(totalCost * 100) / 100,
          successRate,
          avgResponseTime,
          lastActivity: new Date().toISOString(),
        },
      },
    });
  }

  // Get LLM status
  getStatus() {
    return {
      availableProviders: llmManager.getAvailableProviders(),
      models: {
        anthropic: llmManager.getModelsForProvider('anthropic'),
        openai: llmManager.getModelsForProvider('openai'),
        google: llmManager.getModelsForProvider('google'),
      },
    };
  }
}

export const agentRuntime = new AgentRuntimeService();
