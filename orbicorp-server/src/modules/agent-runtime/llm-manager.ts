import { config } from '../../config/index.js';
import { BaseLLMProvider, LLMMessage, LLMOptions, LLMResponse, StreamChunk, LLM_PROVIDERS, Tool } from './llm-types.js';
import { AnthropicProvider, OpenAIProvider, GoogleProvider, OpenRouterProvider, OPENROUTER_CONFIG } from './providers/index.js';

export interface LLMManagerConfig {
  primary: {
    provider: string;
    model: string;
  };
  failover?: {
    enabled: boolean;
    provider: string;
    model: string;
  };
}

export class LLMManager {
  private providers: Map<string, BaseLLMProvider> = new Map();
  private primaryProvider: string | null = null;
  private primaryModel: string | null = null;
  private failoverEnabled: boolean = false;
  private failoverProvider: string | null = null;
  private failoverModel: string | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize providers based on available API keys
    if (config.llm.anthropic) {
      this.providers.set('anthropic', new AnthropicProvider(config.llm.anthropic));
    }

    if (config.llm.openai) {
      this.providers.set('openai', new OpenAIProvider(config.llm.openai));
    }

    if (config.llm.google) {
      this.providers.set('google', new GoogleProvider(config.llm.google));
    }

    if (config.llm.openrouter) {
      this.providers.set('openrouter', new OpenRouterProvider(config.llm.openrouter));
    }

    // Set default primary provider (prefer OpenRouter if available)
    if (this.providers.has('openrouter')) {
      this.primaryProvider = 'openrouter';
      this.primaryModel = 'anthropic/claude-sonnet-4';
    } else if (this.providers.has('anthropic')) {
      this.primaryProvider = 'anthropic';
      this.primaryModel = 'claude-sonnet-4-6';
    } else if (this.providers.has('openai')) {
      this.primaryProvider = 'openai';
      this.primaryModel = 'gpt-4o';
    } else if (this.providers.has('google')) {
      this.primaryProvider = 'google';
      this.primaryModel = 'gemini-1.5-pro';
    }
  }

  // Configure primary and failover
  configure(config: LLMManagerConfig) {
    if (this.providers.has(config.primary.provider)) {
      this.primaryProvider = config.primary.provider;
      this.primaryModel = config.primary.model;
    }

    if (config.failover?.enabled && this.providers.has(config.failover.provider)) {
      this.failoverEnabled = true;
      this.failoverProvider = config.failover.provider;
      this.failoverModel = config.failover.model;
    }
  }

  // Get available providers
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // Get models for a provider
  getModelsForProvider(providerName: string) {
    if (providerName === 'openrouter') {
      return OPENROUTER_CONFIG.models;
    }
    return LLM_PROVIDERS[providerName]?.models || [];
  }

  // Check if a specific provider is available
  hasProvider(providerName: string): boolean {
    return this.providers.has(providerName);
  }

  // Initialize a provider dynamically with API key
  initializeProvider(providerName: string, apiKey: string): boolean {
    if (!apiKey) return false;
    
    try {
      switch (providerName) {
        case 'anthropic':
          this.providers.set('anthropic', new AnthropicProvider(apiKey));
          break;
        case 'openai':
          this.providers.set('openai', new OpenAIProvider(apiKey));
          break;
        case 'google':
          this.providers.set('google', new GoogleProvider(apiKey));
          break;
        case 'openrouter':
          this.providers.set('openrouter', new OpenRouterProvider(apiKey));
          break;
        default:
          return false;
      }
      
      // Set as primary if no primary exists
      if (!this.primaryProvider) {
        this.primaryProvider = providerName;
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to initialize provider ${providerName}:`, error);
      return false;
    }
  }

  // Chat with automatic failover
  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    if (!this.primaryProvider || !this.providers.has(this.primaryProvider)) {
      return {
        success: false,
        content: '',
        model: '',
        provider: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { input: 0, output: 0, total: 0 },
        latency: 0,
        error: 'No LLM provider configured. Please add API keys in .env',
      };
    }

    const provider = this.providers.get(this.primaryProvider)!;
    const model = options.model || this.primaryModel!;

    const result = await provider.chat(messages, { ...options, model });

    // If failed and failover is enabled, try failover provider
    if (!result.success && this.failoverEnabled && this.failoverProvider) {
      const failoverProviderInstance = this.providers.get(this.failoverProvider);
      if (failoverProviderInstance) {
        console.log(`Primary provider failed, trying failover: ${this.failoverProvider}`);
        const failoverResult = await failoverProviderInstance.chat(messages, {
          ...options,
          model: this.failoverModel!,
        });
        
        if (failoverResult.success) {
          return {
            ...failoverResult,
            // @ts-ignore - Add flag to indicate failover was used
            wasFailover: true,
          };
        }
      }
    }

    return result;
  }

  // Streaming chat with automatic failover
  async *chatStream(messages: LLMMessage[], options: LLMOptions & { provider?: string } = {}): AsyncGenerator<StreamChunk> {
    const providerName = options.provider || this.primaryProvider;
    
    if (!providerName || !this.providers.has(providerName)) {
      yield {
        type: 'error',
        error: 'No LLM provider configured. Please add API keys in settings.',
      };
      return;
    }

    const provider = this.providers.get(providerName)!;
    const model = options.model || this.primaryModel!;

    let hasError = false;
    let errorMessage = '';

    try {
      for await (const chunk of provider.chatStream(messages, { ...options, model })) {
        if (chunk.type === 'error') {
          hasError = true;
          errorMessage = chunk.error || 'Unknown error';
          break;
        }
        yield chunk;
      }
    } catch (error) {
      hasError = true;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // If streaming failed and failover is enabled
    if (hasError && this.failoverEnabled && this.failoverProvider) {
      const failoverProviderInstance = this.providers.get(this.failoverProvider);
      if (failoverProviderInstance) {
        console.log(`Primary streaming failed, trying failover: ${this.failoverProvider}`);
        
        yield { type: 'start' }; // Re-start for failover
        
        for await (const chunk of failoverProviderInstance.chatStream(messages, {
          ...options,
          model: this.failoverModel!,
        })) {
          yield chunk;
        }
        return;
      }
    }

    if (hasError) {
      yield { type: 'error', error: errorMessage };
    }
  }

  // Chat with specific provider (bypass failover)
  async chatWithProvider(
    providerName: string,
    messages: LLMMessage[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        success: false,
        content: '',
        model: options.model || '',
        provider: providerName,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { input: 0, output: 0, total: 0 },
        latency: 0,
        error: `Provider ${providerName} is not configured`,
      };
    }

    return provider.chat(messages, options);
  }

  // Benchmark all providers with the same prompt
  async benchmark(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse[]> {
    const results: LLMResponse[] = [];

    for (const [name, provider] of this.providers) {
      const providerConfig = LLM_PROVIDERS[name];
      const model = providerConfig.defaultModel;
      
      const result = await provider.chat(messages, { ...options, model });
      results.push(result);
    }

    return results;
  }
}

// Singleton instance
export const llmManager = new LLMManager();
