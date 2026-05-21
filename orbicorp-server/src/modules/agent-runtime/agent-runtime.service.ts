import prisma from '../../shared/utils/prisma.js';
import { llmManager } from './llm-manager.js';
import { LLMMessage, StreamChunk, TextContent, ImageContent, AGENT_TOOLS, EXTENDED_AGENT_TOOLS, ToolUse } from './llm-types.js';
import {
  CreateTaskOutputSchema,
  ListTasksOutputSchema,
  ProgressTrackerOutputSchema,
  PlanCardOutputSchema,
  OptionListOutputSchema,
  ErrorOutputSchema,
  type ToolOutput,
} from './tool-schemas.js';
import { fileProcessor, FileAttachment } from './file-processor.js';
import { browserService } from '../browser/browser.service.js';

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
    console.log('Tools sent to LLM:', EXTENDED_AGENT_TOOLS.map(t => t.name));

    let streamedContent = '';
    let finalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let finalCost = { input: 0, output: 0, total: 0 };

    const llmOptions = {
      provider,
      model,
      maxTokens: options.maxTokens || agent.maxTokens,
      temperature: options.temperature ?? agent.temperature,
      systemPrompt: agent.systemPrompt || undefined,
      tools: EXTENDED_AGENT_TOOLS,
    };

    // Tool-use loop: LLM may call tools, we execute and feed results back
    const MAX_TOOL_ROUNDS = 10;
    let currentMessages = [...history];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let roundText = '';
      let toolUses: ToolUse[] = [];

      // Stream from LLM
      for await (const chunk of llmManager.chatStream(currentMessages, llmOptions)) {
        if (chunk.type === 'chunk' && chunk.content) {
          streamedContent += chunk.content;
          roundText += chunk.content;
        }

        // Debug: log non-chunk events
        if (chunk.type !== 'chunk') {
          console.log('Stream chunk type:', chunk.type, chunk.tool_use ? `tool: ${chunk.tool_use.name}` : '');
        }

        // Collect tool uses
        if (chunk.type === 'tool_use' && chunk.tool_use) {
          toolUses.push(chunk.tool_use);

          // Execute the tool (with safety catch)
          let toolResult: { success: boolean; message: string; data?: any };
          try {
            toolResult = await this.executeAgentTool(
              chunk.tool_use,
              agent.companyId,
              agent.id,
              userId
            );
          } catch (toolError) {
            console.error('[Tool Loop] Unhandled tool error:', toolError);
            toolResult = {
              success: false,
              message: `Araç hatası: ${toolError instanceof Error ? toolError.message : 'Bilinmeyen hata'}`,
            };
          }

          // Yield only the tool card to frontend, not the full content (LLM will summarize)
          const toolCardMatch = toolResult.message.match(/<!--TOOL_START-->[\s\S]*?<!--TOOL_END-->/);
          const toolDisplayContent = toolCardMatch ? toolCardMatch[0] : `🔧 *${this.getToolDisplayName(chunk.tool_use.name)}*`;
          yield {
            type: 'chunk',
            content: `\n\n${toolDisplayContent}\n\n`
          };
          streamedContent += `\n\n${toolDisplayContent}\n\n`;

          // Store result on the tool use object for later
          (chunk.tool_use as any)._result = toolResult;
        }

        if (chunk.type === 'done') {
          finalUsage = chunk.usage || finalUsage;
          finalCost = chunk.cost || finalCost;
        }

        // Don't yield tool_use, done, or start chunks during tool rounds (start only on first round)
        if (chunk.type === 'tool_use' || chunk.type === 'done') continue;
        if (chunk.type === 'start' && round > 0) continue;
        yield chunk;
      }

      // If no tools were called, this is the final round — yield done
      if (toolUses.length === 0) {
        yield { type: 'done', usage: finalUsage, cost: finalCost };
        break;
      }

      // Safety: if this is the last round, yield done anyway
      if (round === MAX_TOOL_ROUNDS - 1) {
        console.warn('[Tool Loop] Max rounds reached, stopping');
        yield { type: 'done', usage: finalUsage, cost: finalCost };
      }

      // Build assistant message with text + tool_use blocks for conversation history
      const assistantContent: any[] = [];
      if (roundText) {
        assistantContent.push({ type: 'text', text: roundText });
      }
      for (const tu of toolUses) {
        assistantContent.push({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input,
        });
      }

      currentMessages.push({
        role: 'assistant',
        content: assistantContent as any,
      });

      // Build tool result message — strip HTML tool cards, send clean content to LLM
      const toolResultContent: any[] = toolUses.map(tu => {
        const result = (tu as any)._result;
        let resultText = result?.message || 'Tool executed';
        // Remove HTML tool card markup — LLM doesn't need it
        resultText = resultText.replace(/<!--TOOL_START-->[\s\S]*?<!--TOOL_END-->/g, '').trim();
        return {
          type: 'tool_result',
          tool_use_id: tu.id,
          content: resultText,
          is_error: result?.success === false,
        };
      });

      currentMessages.push({
        role: 'user',
        content: toolResultContent as any,
      });

      console.log(`[Tool Loop] Round ${round + 1}: ${toolUses.map(t => t.name).join(', ')} — sending results back to LLM`);
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
      
      history.push({ role: 'system', content: finalPrompt });
    }

    // Add conversation messages (excluding the last user message which we'll add with multimodal content)
    // We skip the last message if currentMessageContent is provided (it's the current message being processed)
    const messagesToProcess = currentMessageContent ? messages.slice(0, -1) : messages;
    
    for (const msg of messagesToProcess) {
      if (msg.role === 'SYSTEM') continue; // Skip system messages in history

      let content = msg.content;

      // Eski assistant mesajlarındaki tool çıktılarını temizle
      // Önceki hatalı browse_web sonuçları LLM'i yanıltabilir
      if (msg.role === 'ASSISTANT') {
        // <!--TOOL_START-->...<!--TOOL_END--> bloklarını kaldır
        content = content.replace(/<!--TOOL_START-->[\s\S]*?<!--TOOL_END-->/g, '');
        // 🔧 tool satırlarını kaldır (Sayfa açıldı: ... ve sonraki içerik dahil)
        content = content.replace(/\n*🔧 \*[^*]+\*\n[\s\S]*?(?=\n\n[^�\n]|$)/g, '');
        content = content.trim();
        if (!content) continue; // Sadece tool çıktısı varsa mesajı atla
      }

      history.push({
        role: msg.role === 'USER' ? 'user' : 'assistant',
        content,
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
      plan_task: 'Plan Hazırlanıyor',
      ask_user: 'Soru Soruluyor',
      browse_web: 'Web Sayfası Açılıyor',
      read_current_page: 'Sayfa Okunuyor',
      fill_form: 'Form Dolduruluyor',
      click_button: 'Butona Tıklanıyor',
      navigate: 'Sayfaya Gidiliyor',
      click_element: 'Elemente Tıklanıyor',
      screenshot: 'Ekran Görüntüsü Alınıyor',
      close_browser: 'Tarayıcı Kapatılıyor',
    };
    return names[toolName] || toolName;
  }

  // Execute agent tool and return result
  private async executeAgentTool(
    toolUse: ToolUse,
    companyId: string,
    agentId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; data?: ToolOutput }> {
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
          
          const createOutput = CreateTaskOutputSchema.parse({
            component:   'approval-card',
            taskId:      task.id,
            title:       'Görev Oluştur',
            description: `"${task.name}" görevi oluşturulacak. Onayladıktan sonra sisteme kaydedilecek.`,
            variant:     'default',
            metadata: [
              { key: 'Ad',        value: task.name },
              { key: 'Öncelik',   value: task.priority },
              { key: 'Açıklama',  value: task.description || '-' },
              { key: 'Durum',     value: 'Beklemede' },
            ],
          });
          return { success: true, message: `Görev hazırlandı: "${task.name}"`, data: createOutput };
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

          const listOutput = ListTasksOutputSchema.parse({
            component: 'data-table',
            title:     tasks.length === 0 ? 'Görev bulunamadı' : `Görevler (${tasks.length})`,
            total:     tasks.length,
            filter:    input.status,
            columns: [
              { key: 'name',     label: 'Görev Adı',  sortable: true  },
              { key: 'status',   label: 'Durum',       sortable: true  },
              { key: 'priority', label: 'Öncelik',     sortable: true  },
              { key: 'progress', label: 'İlerleme',    sortable: true  },
            ],
            rows: tasks.map(t => ({
              id:       t.id,
              name:     t.name,
              status:   t.status,
              priority: t.priority,
              progress: t.progress,
            })),
          });
          return {
            success: true,
            message: tasks.length === 0 ? 'Aktif görev bulunamadı.' : `${tasks.length} görev listelendi.`,
            data: listOutput,
          };
        }

        case 'update_task': {
          const task = await prisma.task.findFirst({
            where: { id: input.task_id, companyId },
          });

          if (!task) {
            return {
              success: false,
              message: `Görev bulunamadı: ${input.task_id}`,
              data: ErrorOutputSchema.parse({
                component: 'error-card',
                toolName:  'update_task',
                message:   `ID'si "${input.task_id}" olan görev bulunamadı.`,
              }),
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

          // Son logları al
          const updatedTask = await prisma.task.findUnique({ where: { id: input.task_id } });
          const recentLogs = ((updatedTask?.logs || []) as Array<{timestamp:string;message:string}>)
            .slice(-3)
            .map(l => ({ timestamp: l.timestamp, message: l.message }));

          const progressOutput = ProgressTrackerOutputSchema.parse({
            component: 'progress-tracker',
            taskId:    task.id,
            taskName:  task.name,
            progress:  updates.progress ?? task.progress,
            status:    updates.status ?? task.status,
            changes:   messages,
            message:   `"${task.name}" görevi güncellendi.`,
            logs:      recentLogs,
          });
          return {
            success: true,
            message: `"${task.name}" görevi güncellendi.`,
            data: progressOutput,
          };
        }

        case 'plan_task': {
          // plan_task: Prisma'ya kayıt yok, sadece şematik output üret
          // LLM steps parametresini doldurur, biz onu PlanCard'a dönüştürürüz
          const planOutput = PlanCardOutputSchema.parse({
            component:         'plan-card',
            planId:            `plan-${Date.now()}`,
            title:             input.title,
            description:       input.description,
            priority:          input.priority || 'MEDIUM',
            estimatedDuration: input.estimatedDuration,
            steps: (input.steps || []).map((s: any) => ({
              id:          s.id,
              title:       s.title,
              description: s.description,
              tool:        s.tool,
              duration:    s.duration,
              status:      'pending' as const,
            })),
          });
          return {
            success: true,
            message: `Plan hazırlandı: "${input.title}" (${(input.steps||[]).length} adım)`,
            data: planOutput,
          };
        }

        case 'ask_user': {
          // ask_user: Kullanıcıya seçenek sunar, Seçenek C uygulanır
          const optionOutput = OptionListOutputSchema.parse({
            component:     'option-list',
            questionId:    `q-${Date.now()}`,
            question:      input.question,
            context:       input.context,
            allowMultiple: input.allowMultiple || false,
            options:       (input.options || []).map((o: any) => ({
              id:          o.id,
              label:       o.label,
              description: o.description,
              icon:        o.icon,
            })),
          });
          return {
            success: true,
            message: `Soru: "${input.question}"`,
            data: optionOutput,
          };
        }

        // ═══════════════════════════════════════════
        // BROWSER TOOLS
        // ═══════════════════════════════════════════

        case 'browse_web': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const result = await browserService.navigate(sessionBrowserId, input.url);
          const summary = result.content.slice(0, 2000);
          return {
            success: true,
            message: `<!--TOOL_START--><div class="tool-card"><strong>browse_web</strong><br>URL: ${result.url}<br>Başlık: ${result.title}</div><!--TOOL_END-->\n\nSayfa açıldı: **${result.title}**\n\n${summary}`,
          };
        }

        case 'read_current_page': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const page = await browserService.readPage(sessionBrowserId);
          const formInfo = page.forms.length > 0
            ? `\n\n**Formlar (${page.forms.length}):**\n` + page.forms.map(f =>
                `- ${f.id}: ${f.fields.map(fi => fi.name).join(', ')}`
              ).join('\n')
            : '';
          const buttonInfo = page.buttons.length > 0
            ? `\n\n**Butonlar (${page.buttons.length}):**\n` + page.buttons.map(b => `- "${b.text}"`).join('\n')
            : '';
          const linkInfo = page.links.length > 0
            ? `\n\n**Linkler (${page.links.length}):**\n` + page.links.slice(0, 10).map(l => `- [${l.text}](${l.href})`).join('\n')
            : '';
          return {
            success: true,
            message: `<!--TOOL_START--><div class="tool-card"><strong>read_current_page</strong><br>URL: ${page.url}<br>Başlık: ${page.title}</div><!--TOOL_END-->\n\n**${page.title}** (${page.url})\n\n${page.content.slice(0, 2000)}${formInfo}${buttonInfo}${linkInfo}`,
          };
        }

        case 'fill_form': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const result = await browserService.fillForm(sessionBrowserId, input.fields || {});
          const filledStr = result.filled.length > 0 ? `Dolduruldu: ${result.filled.join(', ')}` : '';
          const failedStr = result.failed.length > 0 ? `Başarısız: ${result.failed.join(', ')}` : '';
          return {
            success: result.success,
            message: `<!--TOOL_START--><div class="tool-card"><strong>fill_form</strong><br>${result.success ? 'Başarılı' : 'Kısmi başarı'} — Form Dolduruldu<br>${filledStr}${failedStr ? '<br>' + failedStr : ''}</div><!--TOOL_END-->`,
          };
        }

        case 'click_button': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const result = await browserService.clickButton(sessionBrowserId, input.button_text);
          return {
            success: result.success,
            message: `<!--TOOL_START--><div class="tool-card"><strong>click_button</strong><br>${result.message}${result.newUrl ? '<br>Yeni URL: ' + result.newUrl : ''}</div><!--TOOL_END-->`,
          };
        }

        case 'navigate': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const result = await browserService.navigate(sessionBrowserId, input.url);
          return {
            success: true,
            message: `<!--TOOL_START--><div class="tool-card"><strong>navigate</strong><br>URL: ${result.url}<br>Başlık: ${result.title}</div><!--TOOL_END-->\n\nSayfa: **${result.title}**\n\n${result.content.slice(0, 2000)}`,
          };
        }

        case 'click_element': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const result = await browserService.click(sessionBrowserId, input.selector);
          return {
            success: result.success,
            message: `<!--TOOL_START--><div class="tool-card"><strong>click_element</strong><br>${result.message}${result.newUrl ? '<br>Yeni URL: ' + result.newUrl : ''}</div><!--TOOL_END-->`,
          };
        }

        case 'screenshot': {
          const sessionBrowserId = await browserService.getOrCreateSession(agentId, companyId);
          const buffer = await browserService.screenshot(sessionBrowserId);
          const base64 = buffer.toString('base64');
          return {
            success: true,
            message: `<!--TOOL_START--><div class="tool-card"><strong>screenshot</strong><br>Ekran görüntüsü alındı (${Math.round(buffer.length / 1024)} KB)</div><!--TOOL_END-->\n\n![screenshot](data:image/png;base64,${base64.slice(0, 100)}...)`,
          };
        }

        case 'close_browser': {
          const activeSessions = browserService.getActiveSessions();
          const agentSession = activeSessions.find(s => s.includes(agentId));
          if (agentSession) {
            await browserService.closeSession(agentSession);
          }
          return {
            success: true,
            message: `<!--TOOL_START--><div class="tool-card"><strong>close_browser</strong><br>Tarayıcı oturumu kapatıldı.</div><!--TOOL_END-->`,
          };
        }

        default:
          return {
            success: false,
            message: `Bilinmeyen araç: ${name}`,
            data: ErrorOutputSchema.parse({
              component: 'error-card',
              toolName:  name,
              message:   `"${name}" aracı tanımlı değil.`,
            }),
          };
      }
    } catch (error) {
      console.error('Tool execution error:', error);
      const errMsg = error instanceof Error ? error.message : 'Bilinmeyen hata';
      return {
        success: false,
        message: `Araç hatası: ${errMsg}`,
        data: ErrorOutputSchema.parse({
          component: 'error-card',
          toolName:  name,
          message:   errMsg,
        }),
      };
    }
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
