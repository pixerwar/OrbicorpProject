import { BaseLLMProvider, LLMMessage, LLMOptions, LLMResponse, StreamChunk, ProviderConfig } from '../llm-types.js';

// OpenRouter specific config (not in base LLM_PROVIDERS)
export const OPENROUTER_CONFIG: ProviderConfig = {
  name: 'OpenRouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  models: [
    // Anthropic via OpenRouter
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 8192, contextWindow: 200000 },
    { id: 'anthropic/claude-haiku-4', name: 'Claude Haiku 4', costPer1kInput: 0.0008, costPer1kOutput: 0.004, maxTokens: 8192, contextWindow: 200000 },
    { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', costPer1kInput: 0.015, costPer1kOutput: 0.075, maxTokens: 4096, contextWindow: 200000 },
    
    // OpenAI via OpenRouter
    { id: 'openai/gpt-4o', name: 'GPT-4o', costPer1kInput: 0.005, costPer1kOutput: 0.015, maxTokens: 4096, contextWindow: 128000 },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 16384, contextWindow: 128000 },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', costPer1kInput: 0.01, costPer1kOutput: 0.03, maxTokens: 4096, contextWindow: 128000 },
    
    // Google via OpenRouter
    { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', costPer1kInput: 0.00125, costPer1kOutput: 0.005, maxTokens: 8192, contextWindow: 1000000 },
    { id: 'google/gemini-flash-1.5', name: 'Gemini 1.5 Flash', costPer1kInput: 0.000075, costPer1kOutput: 0.0003, maxTokens: 8192, contextWindow: 1000000 },
    
    // Meta Llama
    { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', costPer1kInput: 0.003, costPer1kOutput: 0.003, maxTokens: 4096, contextWindow: 131072 },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', costPer1kInput: 0.0008, costPer1kOutput: 0.0008, maxTokens: 4096, contextWindow: 131072 },
    { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', costPer1kInput: 0.0001, costPer1kOutput: 0.0001, maxTokens: 4096, contextWindow: 131072 },
    
    // Mistral
    { id: 'mistralai/mistral-large', name: 'Mistral Large', costPer1kInput: 0.003, costPer1kOutput: 0.009, maxTokens: 8192, contextWindow: 128000 },
    { id: 'mistralai/mistral-medium', name: 'Mistral Medium', costPer1kInput: 0.0027, costPer1kOutput: 0.0081, maxTokens: 8192, contextWindow: 32000 },
    { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', costPer1kInput: 0.0005, costPer1kOutput: 0.0005, maxTokens: 4096, contextWindow: 32000 },
    
    // DeepSeek
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', costPer1kInput: 0.00014, costPer1kOutput: 0.00028, maxTokens: 4096, contextWindow: 64000 },
    { id: 'deepseek/deepseek-coder', name: 'DeepSeek Coder', costPer1kInput: 0.00014, costPer1kOutput: 0.00028, maxTokens: 4096, contextWindow: 64000 },
    
    // Qwen
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', costPer1kInput: 0.0004, costPer1kOutput: 0.0004, maxTokens: 4096, contextWindow: 131072 },
    
    // Cohere
    { id: 'cohere/command-r-plus', name: 'Command R+', costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 4096, contextWindow: 128000 },
    { id: 'cohere/command-r', name: 'Command R', costPer1kInput: 0.0005, costPer1kOutput: 0.0015, maxTokens: 4096, contextWindow: 128000 },
  ],
  defaultModel: 'anthropic/claude-sonnet-4',
};

export class OpenRouterProvider extends BaseLLMProvider {
  private siteUrl: string;
  private siteName: string;

  constructor(apiKey: string, siteUrl: string = 'https://orbicorp.ai', siteName: string = 'Orbicorp') {
    // Call parent with a dummy provider name, we'll override config
    super(apiKey, 'openai'); // Use openai as base since API is compatible
    
    // Override with OpenRouter config
    this.config = OPENROUTER_CONFIG;
    this.siteUrl = siteUrl;
    this.siteName = siteName;
  }

  async chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
    const model = options.model || this.config.defaultModel;
    const startTime = Date.now();

    try {
      // Format messages (OpenAI compatible)
      const formattedMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Add system prompt if provided
      if (options.systemPrompt && !messages.find(m => m.role === 'system')) {
        formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
          messages: formattedMessages,
        }),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          content: '',
          model,
          provider: 'openrouter',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: { input: 0, output: 0, total: 0 },
          latency,
          error: `OpenRouter API Error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      const content = data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        content,
        model: data.model || model, // OpenRouter returns actual model used
        provider: 'openrouter',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        cost: this.calculateCost(inputTokens, outputTokens, model),
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        content: '',
        model,
        provider: 'openrouter',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { input: 0, output: 0, total: 0 },
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async *chatStream(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<StreamChunk> {
    const model = options.model || this.config.defaultModel;

    try {
      const formattedMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      if (options.systemPrompt && !messages.find(m => m.role === 'system')) {
        formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
          stream: true,
          messages: formattedMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield { type: 'error', error: `OpenRouter API Error: ${response.status} - ${errorText}` };
        return;
      }

      yield { type: 'start' };

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: 'error', error: 'No response body' };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let totalContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                totalContent += content;
                yield { type: 'chunk', content };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Estimate tokens
      const estimatedInputTokens = Math.ceil(
        formattedMessages.reduce((sum, m) => sum + m.content.length / 4, 0)
      );
      const estimatedOutputTokens = Math.ceil(totalContent.length / 4);

      yield {
        type: 'done',
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        },
        cost: this.calculateCost(estimatedInputTokens, estimatedOutputTokens, model),
      };
    } catch (error) {
      yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Get all available models (useful for dynamic model selection)
  getAvailableModels() {
    return this.config.models;
  }

  // Get models by provider prefix
  getModelsByProvider(providerPrefix: string) {
    return this.config.models.filter(m => m.id.startsWith(providerPrefix + '/'));
  }
}
