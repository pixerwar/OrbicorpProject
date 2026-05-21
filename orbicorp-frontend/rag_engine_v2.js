/**
 * OrbiCorp RAG System - RAG Engine v2
 * 
 * Multi-LLM Provider desteği ile güncellenmiş RAG Engine.
 * Claude, OpenAI, Gemini entegrasyonu + failover + benchmark.
 * 
 * @version 2.0.0
 */

// ============================================
// CONFIGURATION
// ============================================

const RAG_CONFIG = {
  // Context assembly
  MAX_CONTEXT_CHUNKS: 5,
  MAX_CONTEXT_CHARS: 6000,
  
  // Scoring thresholds
  HIGH_CONFIDENCE_THRESHOLD: 15,
  MEDIUM_CONFIDENCE_THRESHOLD: 5,
  LOW_CONFIDENCE_THRESHOLD: 1,
  
  // Response settings
  INCLUDE_SOURCES: true,
  LANGUAGE: 'tr' // 'tr' veya 'en'
};

// ============================================
// SYSTEM PROMPTS
// ============================================

const SYSTEM_PROMPTS = {
  tr: `Sen OrbiCorp'un AI asistanısın. Görevin, kullanıcılara OrbiCorp platformu hakkında yardımcı olmaktır.

KURALLAR:
1. Sadece sağlanan BAĞLAM BİLGİSİ'ne dayanarak cevap ver
2. Bağlamda bulunmayan bilgiler için "Bu konuda dokümantasyonda bilgi bulamadım" de
3. Cevaplarını Türkçe ver (teknik terimler İngilizce kalabilir)
4. Kısa ve öz cevaplar ver, gereksiz detaylardan kaçın
5. Emin olmadığın konularda bunu belirt
6. Kaynak referanslarını belirt (örn: "Dashboard sayfasına göre...")

CEVAP FORMATI:
- Doğrudan soruyu yanıtla
- Gerekirse adım adım açıkla
- İlgili sayfa/bölüm referansı ver`,

  en: `You are OrbiCorp's AI assistant. Your role is to help users with the OrbiCorp platform.

RULES:
1. Answer based ONLY on the provided CONTEXT INFORMATION
2. For information not in the context, say "I couldn't find this information in the documentation"
3. Provide answers in English
4. Give concise answers, avoid unnecessary details
5. Indicate uncertainty when applicable
6. Reference sources (e.g., "According to the Dashboard page...")

RESPONSE FORMAT:
- Directly answer the question
- Use step-by-step explanations when needed
- Reference relevant pages/sections`
};

// ============================================
// PROMPT BUILDER
// ============================================

class PromptBuilder {
  constructor(config = RAG_CONFIG) {
    this.config = config;
  }
  
  /**
   * RAG prompt'u oluşturur
   */
  buildPrompt(query, searchResults, conversationHistory = []) {
    const systemPrompt = SYSTEM_PROMPTS[this.config.LANGUAGE] || SYSTEM_PROMPTS.tr;
    
    // Context oluştur
    const contextBlock = this._buildContextBlock(searchResults);
    
    // Confidence level belirle
    const confidence = this._determineConfidence(searchResults);
    
    // User message
    const userMessage = `BAĞLAM BİLGİSİ:
${contextBlock}

---
GÜVENİLİRLİK SEVİYESİ: ${confidence.level} (${confidence.description})

KULLANICI SORUSU: ${query}

Yukarıdaki bağlam bilgisini kullanarak soruyu yanıtla.${
  confidence.level === 'LOW' 
    ? ' Not: Bağlamda yeterli bilgi olmayabilir, bunu kullanıcıya belirt.' 
    : ''
}`;

    return {
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ],
      metadata: {
        confidence,
        sourcesUsed: searchResults.map(r => ({
          source: r.metadata?.source,
          section: r.metadata?.section,
          score: r.score
        }))
      }
    };
  }
  
  /**
   * Context bloğu oluşturur
   */
  _buildContextBlock(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return '[Bağlam bilgisi bulunamadı]';
    }
    
    let totalChars = 0;
    const contextParts = [];
    
    for (let i = 0; i < Math.min(searchResults.length, this.config.MAX_CONTEXT_CHUNKS); i++) {
      const result = searchResults[i];
      const source = result.metadata?.source || 'Bilinmiyor';
      const section = result.metadata?.section || 'Genel';
      
      const contextEntry = `[Kaynak ${i + 1}: ${source} - ${section}]
${result.content}`;
      
      if (totalChars + contextEntry.length > this.config.MAX_CONTEXT_CHARS) {
        break;
      }
      
      contextParts.push(contextEntry);
      totalChars += contextEntry.length;
    }
    
    return contextParts.join('\n\n---\n\n');
  }
  
  /**
   * Güvenilirlik seviyesi belirler
   */
  _determineConfidence(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return { level: 'NONE', description: 'Hiç sonuç bulunamadı', score: 0 };
    }
    
    const topScore = searchResults[0].score;
    
    if (topScore >= this.config.HIGH_CONFIDENCE_THRESHOLD) {
      return { level: 'HIGH', description: 'Yüksek eşleşme', score: topScore };
    }
    
    if (topScore >= this.config.MEDIUM_CONFIDENCE_THRESHOLD) {
      return { level: 'MEDIUM', description: 'Orta düzey eşleşme', score: topScore };
    }
    
    if (topScore >= this.config.LOW_CONFIDENCE_THRESHOLD) {
      return { level: 'LOW', description: 'Düşük eşleşme', score: topScore };
    }
    
    return { level: 'VERY_LOW', description: 'Çok düşük eşleşme', score: topScore };
  }
}

// ============================================
// RAG ENGINE v2 (Multi-LLM)
// ============================================

class RAGEngine {
  constructor(searchEngine, llmManager = null, config = {}) {
    this.searchEngine = searchEngine;
    this.llmManager = llmManager;
    this.config = { ...RAG_CONFIG, ...config };
    this.promptBuilder = new PromptBuilder(this.config);
    
    // Conversation history
    this.conversationHistory = [];
    
    // Stats
    this.stats = {
      totalQueries: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      noResults: 0,
      llmCalls: {
        anthropic: 0,
        openai: 0,
        google: 0
      },
      failoverUsed: 0
    };
  }
  
  /**
   * LLM Manager ayarlar
   */
  setLLMManager(llmManager) {
    this.llmManager = llmManager;
    return this;
  }
  
  /**
   * Soru sorar ve cevap için gerekli prompt'u hazırlar
   */
  async prepareQuery(query, options = {}) {
    const {
      topK = this.config.MAX_CONTEXT_CHUNKS,
      includeHistory = true,
      filters = {}
    } = options;
    
    this.stats.totalQueries++;
    
    // Search yap
    const searchResult = this.searchEngine.search(query, {
      topK,
      enhanceQuery: true,
      filters
    });
    
    // Prompt oluştur
    const history = includeHistory ? this.conversationHistory.slice(-6) : [];
    const prompt = this.promptBuilder.buildPrompt(
      query, 
      searchResult.results, 
      history
    );
    
    // Stats güncelle
    this._updateStats(prompt.metadata.confidence.level);
    
    return {
      prompt,
      searchResult,
      query: {
        original: query,
        enhanced: searchResult.enhancedQuery,
        type: searchResult.queryType
      }
    };
  }
  
  /**
   * LLM yanıtını işler ve history'e ekler
   */
  processResponse(query, response, provider = null) {
    // History'e ekle
    this.conversationHistory.push(
      { role: 'user', content: query },
      { role: 'assistant', content: response }
    );
    
    // History boyutunu kontrol et
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-10);
    }
    
    // Provider stats güncelle
    if (provider && this.stats.llmCalls[provider] !== undefined) {
      this.stats.llmCalls[provider]++;
    }
    
    return {
      query,
      response,
      historyLength: this.conversationHistory.length
    };
  }
  
  /**
   * Tam RAG akışı - arama + LLM çağrısı
   */
  async ask(query, options = {}) {
    if (!this.llmManager) {
      // LLM Manager yoksa mock response döndür
      return this.askWithMockResponse(query, options);
    }
    
    // Prompt hazırla
    const prepared = await this.prepareQuery(query, options);
    
    // LLM çağır
    const llmResponse = await this.llmManager.call(prepared.prompt.messages, {
      system: prepared.prompt.system,
      maxTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7
    });
    
    if (!llmResponse.success) {
      return {
        query,
        error: llmResponse.error,
        searchResults: prepared.searchResult.results,
        confidence: prepared.prompt.metadata.confidence
      };
    }
    
    // Failover kullanıldı mı?
    if (llmResponse.wasFailover) {
      this.stats.failoverUsed++;
    }
    
    // Response'u işle
    this.processResponse(query, llmResponse.content, llmResponse.provider);
    
    return {
      query,
      response: llmResponse.content,
      searchResults: prepared.searchResult.results,
      confidence: prepared.prompt.metadata.confidence,
      sources: prepared.prompt.metadata.sourcesUsed,
      llmInfo: {
        provider: llmResponse.provider,
        model: llmResponse.model,
        latency: llmResponse.latency,
        tokens: llmResponse.usage,
        cost: llmResponse.cost,
        wasFailover: llmResponse.wasFailover || false
      }
    };
  }
  
  /**
   * Mock yanıt ile test (LLM olmadan)
   */
  async askWithMockResponse(query, options = {}) {
    const prepared = await this.prepareQuery(query, options);
    
    // Mock response oluştur
    const mockResponse = this._generateMockResponse(prepared);
    
    this.processResponse(query, mockResponse, 'mock');
    
    return {
      query,
      response: mockResponse,
      searchResults: prepared.searchResult.results,
      confidence: prepared.prompt.metadata.confidence,
      sources: prepared.prompt.metadata.sourcesUsed,
      llmInfo: {
        provider: 'mock',
        model: 'mock-model',
        latency: 0,
        tokens: { inputTokens: 0, outputTokens: 0 },
        cost: { total: 0 }
      }
    };
  }
  
  /**
   * Farklı LLM'leri karşılaştırır (benchmark)
   */
  async compareLLMs(query, options = {}) {
    if (!this.llmManager) {
      throw new Error('LLM Manager not configured');
    }
    
    // Prompt hazırla
    const prepared = await this.prepareQuery(query, options);
    
    // Benchmark yap
    const benchmarkResults = await this.llmManager.benchmark(prepared.prompt.messages, {
      system: prepared.prompt.system,
      maxTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7
    });
    
    return {
      query,
      searchResults: prepared.searchResult.results,
      confidence: prepared.prompt.metadata.confidence,
      comparison: benchmarkResults.map(r => ({
        provider: r.provider,
        model: r.model,
        success: r.success,
        latency: r.latency,
        tokens: r.tokens,
        cost: r.cost ? `$${r.cost.toFixed(6)}` : 'N/A',
        error: r.error
      }))
    };
  }
  
  /**
   * Mock yanıt oluşturur
   */
  _generateMockResponse(prepared) {
    const { searchResult, prompt } = prepared;
    const confidence = prompt.metadata.confidence;
    
    if (confidence.level === 'NONE' || searchResult.results.length === 0) {
      return 'Üzgünüm, bu konuda dokümantasyonda bilgi bulamadım. Lütfen sorunuzu farklı şekilde sormayı deneyin.';
    }
    
    const topResult = searchResult.results[0];
    const source = topResult.metadata?.source || 'dokümantasyon';
    const section = topResult.metadata?.section || '';
    
    let response = `${source}${section ? ` (${section} bölümü)` : ''}'na göre:\n\n`;
    
    const snippet = topResult.content.substring(0, 300);
    response += snippet;
    
    if (topResult.content.length > 300) {
      response += '...\n\n';
    }
    
    if (searchResult.results.length > 1) {
      response += '\nİlgili diğer kaynaklar: ';
      response += searchResult.results.slice(1, 3)
        .map(r => r.metadata?.source)
        .filter(Boolean)
        .join(', ');
    }
    
    return response;
  }
  
  /**
   * Stats günceller
   */
  _updateStats(confidenceLevel) {
    switch (confidenceLevel) {
      case 'HIGH':
        this.stats.highConfidence++;
        break;
      case 'MEDIUM':
        this.stats.mediumConfidence++;
        break;
      case 'LOW':
      case 'VERY_LOW':
        this.stats.lowConfidence++;
        break;
      case 'NONE':
        this.stats.noResults++;
        break;
    }
  }
  
  /**
   * Conversation history'i temizler
   */
  clearHistory() {
    this.conversationHistory = [];
  }
  
  /**
   * Stats döndürür
   */
  getStats() {
    const llmMetrics = this.llmManager ? this.llmManager.getAllMetrics() : {};
    
    return {
      ...this.stats,
      searchEngineStats: this.searchEngine.getStats(),
      llmMetrics
    };
  }
}

// ============================================
// ORBICORP RAG (Ana Sınıf)
// ============================================

class OrbiCorpRAG {
  constructor() {
    this.searchEngine = null;
    this.llmManager = null;
    this.ragEngine = null;
    this.isInitialized = false;
  }
  
  /**
   * RAG sistemini başlatır
   */
  async initialize(chunksData, llmConfig = null) {
    // Search Engine'i oluştur
    if (typeof require !== 'undefined') {
      const { SearchEngine } = require('./vector_store.js');
      this.searchEngine = new SearchEngine();
    } else if (typeof window !== 'undefined' && window.SearchEngine) {
      this.searchEngine = new window.SearchEngine();
    } else {
      throw new Error('SearchEngine bulunamadı');
    }
    
    // Chunk'ları yükle
    const chunks = chunksData.chunks || chunksData;
    this.searchEngine.loadChunks(chunks);
    
    // LLM Manager oluştur (varsa)
    if (llmConfig) {
      if (typeof require !== 'undefined') {
        const { LLMManager } = require('./llm_providers.js');
        this.llmManager = new LLMManager();
      } else if (typeof window !== 'undefined' && window.LLMManager) {
        this.llmManager = new window.LLMManager();
      }
      
      if (this.llmManager) {
        // Provider'ları ekle
        if (llmConfig.anthropic) {
          this.llmManager.addProvider('anthropic', llmConfig.anthropic);
        }
        if (llmConfig.openai) {
          this.llmManager.addProvider('openai', llmConfig.openai);
        }
        if (llmConfig.google) {
          this.llmManager.addProvider('google', llmConfig.google);
        }
        
        // Aktif provider ayarla
        if (llmConfig.primary) {
          this.llmManager.setActive(llmConfig.primary.provider, llmConfig.primary.model);
        }
        
        // Failover ayarla
        if (llmConfig.failover?.enabled) {
          this.llmManager.setFailover(
            true, 
            llmConfig.failover.provider, 
            llmConfig.failover.model
          );
        }
      }
    }
    
    // RAG Engine oluştur
    this.ragEngine = new RAGEngine(this.searchEngine, this.llmManager);
    
    this.isInitialized = true;
    
    return {
      success: true,
      chunksLoaded: chunks.length,
      vocabularySize: this.searchEngine.getStats().vectorStore.vocabularySize,
      llmConfigured: !!this.llmManager
    };
  }
  
  /**
   * Settings'ten otomatik konfigürasyon (browser için)
   */
  async initializeFromSettings(chunksData) {
    // Önce temel başlatma
    await this.initialize(chunksData);
    
    // Browser'da SettingsIntegration kullan
    if (typeof window !== 'undefined' && window.SettingsIntegration) {
      this.llmManager = new window.LLMManager();
      window.SettingsIntegration.configureLLMManager(this.llmManager);
      this.ragEngine.setLLMManager(this.llmManager);
    }
    
    return {
      success: true,
      chunksLoaded: chunksData.chunks?.length || chunksData.length,
      llmConfigured: !!this.llmManager
    };
  }
  
  /**
   * Soru sorar
   */
  async ask(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error('RAG sistemi başlatılmadı');
    }
    
    return this.ragEngine.ask(query, options);
  }
  
  /**
   * LLM karşılaştırması yapar
   */
  async compareLLMs(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error('RAG sistemi başlatılmadı');
    }
    
    return this.ragEngine.compareLLMs(query, options);
  }
  
  /**
   * Sadece arama yapar
   */
  search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error('RAG sistemi başlatılmadı');
    }
    
    return this.searchEngine.search(query, options);
  }
  
  /**
   * LLM Manager döndürür
   */
  getLLMManager() {
    return this.llmManager;
  }
  
  /**
   * Stats döndürür
   */
  getStats() {
    return this.ragEngine?.getStats() || {};
  }
  
  /**
   * History temizler
   */
  clearHistory() {
    this.ragEngine?.clearHistory();
  }
}

// ============================================
// EXPORTS
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RAGEngine,
    PromptBuilder,
    OrbiCorpRAG,
    RAG_CONFIG,
    SYSTEM_PROMPTS
  };
}

// Browser export
if (typeof window !== 'undefined') {
  window.RAGEngine = RAGEngine;
  window.PromptBuilder = PromptBuilder;
  window.OrbiCorpRAG = OrbiCorpRAG;
  window.RAG_CONFIG = RAG_CONFIG;
}
