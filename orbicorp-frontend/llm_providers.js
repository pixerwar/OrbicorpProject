/**
 * OrbiCorp RAG System - Multi-LLM Provider Adapter
 * 
 * Claude (Anthropic), GPT (OpenAI), Gemini (Google) için
 * unified API interface sağlar.
 * 
 * @version 1.0.0
 */

// ============================================
// CONFIGURATION
// ============================================

const LLM_CONFIG = {
  providers: {
    anthropic: {
      name: 'Anthropic (Claude)',
      endpoint: 'https://api.anthropic.com/v1/messages',
      models: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', costPer1kInput: 0.015, costPer1kOutput: 0.075 },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', costPer1kInput: 0.003, costPer1kOutput: 0.015 },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', costPer1kInput: 0.00025, costPer1kOutput: 0.00125 }
      ],
      defaultModel: 'claude-sonnet-4-6'
    },
    openai: {
      name: 'OpenAI (GPT)',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', costPer1kInput: 0.005, costPer1kOutput: 0.015 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', costPer1kInput: 0.01, costPer1kOutput: 0.03 }
      ],
      defaultModel: 'gpt-4o'
    },
    google: {
      name: 'Google (Gemini)',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      models: [
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', costPer1kInput: 0.00125, costPer1kOutput: 0.005 },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', costPer1kInput: 0.000075, costPer1kOutput: 0.0003 },
        { id: 'gemini-pro', name: 'Gemini Pro', costPer1kInput: 0.0005, costPer1kOutput: 0.0015 }
      ],
      defaultModel: 'gemini-1.5-pro'
    }
  },
  
  defaults: {
    maxTokens: 1000,
    temperature: 0.7,
    timeout: 30000
  }
};

// ============================================
// BASE PROVIDER CLASS
// ============================================

class BaseLLMProvider {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.config = { ...LLM_CONFIG.defaults, ...config };
    this.lastResponse = null;
    this.metrics = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalLatency: 0,
      errors: 0
    };
  }
  
  /**
   * API çağrısı yapar (abstract - override edilmeli)
   */
  async call(messages, options = {}) {
    throw new Error('call() must be implemented by subclass');
  }
  
  /**
   * Metrikleri günceller
   */
  updateMetrics(inputTokens, outputTokens, latency, isError = false) {
    this.metrics.totalCalls++;
    this.metrics.totalInputTokens += inputTokens || 0;
    this.metrics.totalOutputTokens += outputTokens || 0;
    this.metrics.totalLatency += latency || 0;
    if (isError) this.metrics.errors++;
  }
  
  /**
   * Maliyet hesaplar
   */
  calculateCost(inputTokens, outputTokens, model) {
    const modelConfig = this.getModelConfig(model);
    if (!modelConfig) return 0;
    
    const inputCost = (inputTokens / 1000) * modelConfig.costPer1kInput;
    const outputCost = (outputTokens / 1000) * modelConfig.costPer1kOutput;
    
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost
    };
  }
  
  /**
   * Model konfigürasyonunu döndürür
   */
  getModelConfig(modelId) {
    // Override edilmeli
    return null;
  }
  
  /**
   * Metrikleri döndürür
   */
  getMetrics() {
    return {
      ...this.metrics,
      avgLatency: this.metrics.totalCalls > 0 
        ? Math.round(this.metrics.totalLatency / this.metrics.totalCalls) 
        : 0,
      successRate: this.metrics.totalCalls > 0
        ? ((this.metrics.totalCalls - this.metrics.errors) / this.metrics.totalCalls * 100).toFixed(1) + '%'
        : '0%'
    };
  }
}

// ============================================
// ANTHROPIC PROVIDER (Claude)
// ============================================

class AnthropicProvider extends BaseLLMProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    this.providerConfig = LLM_CONFIG.providers.anthropic;
  }
  
  getModelConfig(modelId) {
    return this.providerConfig.models.find(m => m.id === modelId);
  }
  
  async call(messages, options = {}) {
    const {
      model = this.providerConfig.defaultModel,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature,
      system = ''
    } = options;
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.providerConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      
      const latency = Date.now() - startTime;
      
      if (!response.ok) {
        const error = await response.text();
        this.updateMetrics(0, 0, latency, true);
        throw new Error(`Anthropic API Error: ${response.status} - ${error}`);
      }
      
      const data = await response.json();
      
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      
      this.updateMetrics(inputTokens, outputTokens, latency);
      
      const content = data.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
      
      this.lastResponse = {
        success: true,
        content,
        model,
        provider: 'anthropic',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        },
        cost: this.calculateCost(inputTokens, outputTokens, model),
        latency
      };
      
      return this.lastResponse;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateMetrics(0, 0, latency, true);
      
      return {
        success: false,
        error: error.message,
        provider: 'anthropic',
        latency
      };
    }
  }
}

// ============================================
// OPENAI PROVIDER (GPT)
// ============================================

class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    this.providerConfig = LLM_CONFIG.providers.openai;
  }
  
  getModelConfig(modelId) {
    return this.providerConfig.models.find(m => m.id === modelId);
  }
  
  async call(messages, options = {}) {
    const {
      model = this.providerConfig.defaultModel,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature,
      system = ''
    } = options;
    
    const startTime = Date.now();
    
    // System mesajını messages'a ekle
    const fullMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;
    
    try {
      const response = await fetch(this.providerConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: fullMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      
      const latency = Date.now() - startTime;
      
      if (!response.ok) {
        const error = await response.text();
        this.updateMetrics(0, 0, latency, true);
        throw new Error(`OpenAI API Error: ${response.status} - ${error}`);
      }
      
      const data = await response.json();
      
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      
      this.updateMetrics(inputTokens, outputTokens, latency);
      
      const content = data.choices?.[0]?.message?.content || '';
      
      this.lastResponse = {
        success: true,
        content,
        model,
        provider: 'openai',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        },
        cost: this.calculateCost(inputTokens, outputTokens, model),
        latency
      };
      
      return this.lastResponse;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateMetrics(0, 0, latency, true);
      
      return {
        success: false,
        error: error.message,
        provider: 'openai',
        latency
      };
    }
  }
}

// ============================================
// GOOGLE PROVIDER (Gemini)
// ============================================

class GoogleProvider extends BaseLLMProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    this.providerConfig = LLM_CONFIG.providers.google;
  }
  
  getModelConfig(modelId) {
    return this.providerConfig.models.find(m => m.id === modelId);
  }
  
  async call(messages, options = {}) {
    const {
      model = this.providerConfig.defaultModel,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature,
      system = ''
    } = options;
    
    const startTime = Date.now();
    
    // Gemini format: contents array with parts
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    
    // System instruction
    const systemInstruction = system ? { parts: [{ text: system }] } : undefined;
    
    const endpoint = `${this.providerConfig.endpoint}/${model}:generateContent?key=${this.apiKey}`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          systemInstruction,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
          }
        })
      });
      
      const latency = Date.now() - startTime;
      
      if (!response.ok) {
        const error = await response.text();
        this.updateMetrics(0, 0, latency, true);
        throw new Error(`Google API Error: ${response.status} - ${error}`);
      }
      
      const data = await response.json();
      
      // Gemini token sayımı
      const inputTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
      
      this.updateMetrics(inputTokens, outputTokens, latency);
      
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      this.lastResponse = {
        success: true,
        content,
        model,
        provider: 'google',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        },
        cost: this.calculateCost(inputTokens, outputTokens, model),
        latency
      };
      
      return this.lastResponse;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateMetrics(0, 0, latency, true);
      
      return {
        success: false,
        error: error.message,
        provider: 'google',
        latency
      };
    }
  }
}

// ============================================
// UNIFIED LLM MANAGER
// ============================================

class LLMManager {
  constructor() {
    this.providers = {};
    this.activeProvider = null;
    this.activeModel = null;
    this.failoverEnabled = false;
    this.failoverProvider = null;
    this.failoverModel = null;
    
    // Performans karşılaştırma
    this.benchmarkResults = [];
  }
  
  /**
   * Provider ekler
   */
  addProvider(name, apiKey, config = {}) {
    switch (name) {
      case 'anthropic':
        this.providers.anthropic = new AnthropicProvider(apiKey, config);
        break;
      case 'openai':
        this.providers.openai = new OpenAIProvider(apiKey, config);
        break;
      case 'google':
        this.providers.google = new GoogleProvider(apiKey, config);
        break;
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
    
    return this;
  }
  
  /**
   * Aktif provider ve model ayarlar
   */
  setActive(providerName, modelId) {
    if (!this.providers[providerName]) {
      throw new Error(`Provider not configured: ${providerName}`);
    }
    
    this.activeProvider = providerName;
    this.activeModel = modelId;
    
    return this;
  }
  
  /**
   * Failover ayarlar
   */
  setFailover(enabled, providerName = null, modelId = null) {
    this.failoverEnabled = enabled;
    this.failoverProvider = providerName;
    this.failoverModel = modelId;
    
    return this;
  }
  
  /**
   * LLM çağrısı yapar (failover destekli)
   */
  async call(messages, options = {}) {
    const {
      system = '',
      maxTokens,
      temperature
    } = options;
    
    if (!this.activeProvider || !this.providers[this.activeProvider]) {
      throw new Error('No active provider configured');
    }
    
    // Birincil provider ile dene
    const provider = this.providers[this.activeProvider];
    const result = await provider.call(messages, {
      model: this.activeModel,
      system,
      maxTokens,
      temperature
    });
    
    // Başarılı ise döndür
    if (result.success) {
      return result;
    }
    
    // Failover aktif ve failover provider varsa dene
    if (this.failoverEnabled && this.failoverProvider && this.providers[this.failoverProvider]) {
      console.log(`Primary provider failed, trying failover: ${this.failoverProvider}`);
      
      const failoverProviderInstance = this.providers[this.failoverProvider];
      const failoverResult = await failoverProviderInstance.call(messages, {
        model: this.failoverModel,
        system,
        maxTokens,
        temperature
      });
      
      if (failoverResult.success) {
        failoverResult.wasFailover = true;
        return failoverResult;
      }
    }
    
    // Her iki provider da başarısız
    return result;
  }
  
  /**
   * Basit benchmark - aynı sorguyu farklı provider'larda test eder
   */
  async benchmark(messages, options = {}) {
    const results = [];
    
    for (const [name, provider] of Object.entries(this.providers)) {
      const providerConfig = LLM_CONFIG.providers[name];
      const model = providerConfig.defaultModel;
      
      const result = await provider.call(messages, {
        ...options,
        model
      });
      
      results.push({
        provider: name,
        model,
        success: result.success,
        latency: result.latency,
        tokens: result.usage?.totalTokens || 0,
        cost: result.cost?.total || 0,
        error: result.error
      });
    }
    
    // Sonuçları kaydet
    this.benchmarkResults.push({
      timestamp: new Date().toISOString(),
      results
    });
    
    return results;
  }
  
  /**
   * Tüm provider metriklerini döndürür
   */
  getAllMetrics() {
    const metrics = {};
    
    for (const [name, provider] of Object.entries(this.providers)) {
      metrics[name] = provider.getMetrics();
    }
    
    return metrics;
  }
  
  /**
   * Mevcut konfigürasyonu döndürür
   */
  getConfig() {
    return {
      activeProvider: this.activeProvider,
      activeModel: this.activeModel,
      failoverEnabled: this.failoverEnabled,
      failoverProvider: this.failoverProvider,
      failoverModel: this.failoverModel,
      configuredProviders: Object.keys(this.providers),
      benchmarkHistory: this.benchmarkResults.slice(-10)
    };
  }
  
  /**
   * Mevcut provider listesi
   */
  static getAvailableProviders() {
    return LLM_CONFIG.providers;
  }
  
  /**
   * Provider'a göre model listesi
   */
  static getModelsForProvider(providerName) {
    return LLM_CONFIG.providers[providerName]?.models || [];
  }
}

// ============================================
// SETTINGS INTEGRATION HELPER
// ============================================

/**
 * OrbiCorp Settings sayfasından API key'leri okur
 * (Browser ortamında çalışır)
 */
class SettingsIntegration {
  /**
   * Mevcut API key'leri Settings'ten okur
   */
  static getAPIKeys() {
    // Bu fonksiyon browser'da Settings sayfasından okuyacak
    // Demo için sabit değerler
    return {
      anthropic: localStorage.getItem('orbicorp_api_anthropic') || null,
      openai: localStorage.getItem('orbicorp_api_openai') || null,
      google: localStorage.getItem('orbicorp_api_google') || null
    };
  }
  
  /**
   * RAG model tercihlerini okur
   */
  static getRAGPreferences() {
    const stored = localStorage.getItem('orbicorp_rag_preferences');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return null;
      }
    }
    
    return {
      primaryProvider: 'anthropic',
      primaryModel: 'claude-sonnet-4-6',
      failoverEnabled: false,
      failoverProvider: 'openai',
      failoverModel: 'gpt-4o'
    };
  }
  
  /**
   * RAG model tercihlerini kaydeder
   */
  static saveRAGPreferences(preferences) {
    localStorage.setItem('orbicorp_rag_preferences', JSON.stringify(preferences));
  }
  
  /**
   * LLMManager'ı Settings'ten konfigüre eder
   */
  static configureLLMManager(manager) {
    const keys = this.getAPIKeys();
    const prefs = this.getRAGPreferences();
    
    // Mevcut key'leri ekle
    if (keys.anthropic) {
      manager.addProvider('anthropic', keys.anthropic);
    }
    if (keys.openai) {
      manager.addProvider('openai', keys.openai);
    }
    if (keys.google) {
      manager.addProvider('google', keys.google);
    }
    
    // Aktif provider ayarla
    if (prefs.primaryProvider && keys[prefs.primaryProvider]) {
      manager.setActive(prefs.primaryProvider, prefs.primaryModel);
    }
    
    // Failover ayarla
    if (prefs.failoverEnabled && prefs.failoverProvider && keys[prefs.failoverProvider]) {
      manager.setFailover(true, prefs.failoverProvider, prefs.failoverModel);
    }
    
    return manager;
  }
}

// ============================================
// EXPORTS
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LLMManager,
    AnthropicProvider,
    OpenAIProvider,
    GoogleProvider,
    SettingsIntegration,
    LLM_CONFIG
  };
}

// Browser export
if (typeof window !== 'undefined') {
  window.LLMManager = LLMManager;
  window.AnthropicProvider = AnthropicProvider;
  window.OpenAIProvider = OpenAIProvider;
  window.GoogleProvider = GoogleProvider;
  window.SettingsIntegration = SettingsIntegration;
  window.LLM_CONFIG = LLM_CONFIG;
}
