// ==========================================
// AGENT-RUNTIME.SERVICE.TS DEĞİŞİKLİKLERİ
// ==========================================
// Bu dosya mevcut agent-runtime.service.ts'e uygulanacak değişiklikleri gösterir.
// Değişiklikler "// [PATCH]" ile işaretlenmiştir.

// ==========================================
// 1. IMPORT EKLE (dosyanın başına)
// ==========================================

import { packageRuntime } from './package-runtime.service.js';  // [PATCH] Yeni import

// ==========================================
// 2. chatStream FONKSIYONUNDA (satır ~287 civarı)
// ==========================================

// ÖNCE (eski kod):
/*
    // Stream from LLM with tools
    for await (const chunk of llmManager.chatStream(history, {
      provider,
      model,
      maxTokens: options.maxTokens || agent.maxTokens,
      temperature: options.temperature ?? agent.temperature,
      systemPrompt: agent.systemPrompt || undefined,
      tools: AGENT_TOOLS,  // <-- Sabit tool listesi
    })) {
*/

// SONRA (yeni kod):
/*
    // [PATCH] Agent için paket tool'larını yükle
    const packageContext = await packageRuntime.getAgentPackageContext(agent.id);
    
    // [PATCH] Builtin tool'lar + paket tool'larını birleştir
    const allTools = [...AGENT_TOOLS, ...packageContext.tools];
    
    console.log('[AgentRuntime] Tools:', allTools.map(t => t.name));

    // Stream from LLM with tools
    for await (const chunk of llmManager.chatStream(history, {
      provider,
      model,
      maxTokens: options.maxTokens || agent.maxTokens,
      temperature: options.temperature ?? agent.temperature,
      systemPrompt: agent.systemPrompt || undefined,
      tools: allTools,  // [PATCH] Dinamik tool listesi
    })) {
*/

// ==========================================
// 3. buildConversationHistory FONKSIYONUNDA (satır ~404 civarı)
// ==========================================

// ÖNCE (eski kod):
/*
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
*/

// SONRA (yeni kod):
/*
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
      
      // [PATCH] Paket system prompt eklerini ekle
      if (session?.agent?.id) {
        const promptAdditions = await packageRuntime.getSystemPromptAdditions(session.agent.id);
        if (promptAdditions.length > 0) {
          finalPrompt += '\n\n--- YETENEKLERİN ---\n' + promptAdditions.join('\n\n');
        }
      }
      
      history.push({ role: 'system', content: finalPrompt });
    }
*/

// ==========================================
// 4. executeAgentTool FONKSIYONUNDA (satır ~500 civarı)
// ==========================================

// Switch case'in default kısmından ÖNCE şu kodu ekle:
/*
        // [PATCH] Paket tool'larını kontrol et
        default: {
          // Önce paket tool'larına bak
          const toolPackage = await packageRuntime.findToolPackage(agentId, name);
          
          if (toolPackage) {
            // Builtin paket tool'ları
            if (toolPackage.handler.startsWith('builtin:')) {
              const parsed = packageRuntime.parseBuiltinHandler(toolPackage.handler);
              
              if (parsed) {
                // Bu noktada builtin handler'ları yönlendir
                // Örnek: builtin:memory.remember -> mevcut remember case'ine
                // Örnek: builtin:tasks.create -> mevcut create_task case'ine
                
                // Şimdilik mevcut switch-case yapısını kullanıyoruz
                // İleride handler registry sistemi eklenebilir
                console.log(`[AgentRuntime] Builtin handler: ${parsed.category}.${parsed.action}`);
              }
            }
            
            // Custom handler (ileride plugin sistemi için)
            if (toolPackage.handler.startsWith('custom:')) {
              console.log(`[AgentRuntime] Custom handler henüz desteklenmiyor: ${toolPackage.handler}`);
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
*/

// ==========================================
// TAM ENTEGRASYON İÇİN ÖNERİLER
// ==========================================

/*
1. Tool Registry Sistemi:
   - Her builtin handler için bir fonksiyon registry'si oluştur
   - Handler adına göre otomatik yönlendirme yap
   - Örnek:
     const builtinHandlers = {
       'memory.remember': this.handleRemember.bind(this),
       'memory.recall': this.handleRecall.bind(this),
       'tasks.create': this.handleCreateTask.bind(this),
       // ...
     };

2. Plugin Sistemi (custom handlers için):
   - Custom handler dosyalarını yükle
   - Sandbox ortamında çalıştır
   - Sonucu döndür

3. Caching:
   - Agent paket context'ini cache'le
   - Paket değişikliklerinde invalidate et

4. Permissions:
   - Tool çalıştırmadan önce permission kontrolü yap
   - Paket izinlerini kontrol et
*/
