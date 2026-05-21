import { BaseLLMProvider, LLMMessage, LLMOptions, LLMResponse, StreamChunk } from '../llm-types.js';

export class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super(apiKey, 'openai');
  }

  async chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
    const model = options.model || this.config.defaultModel;
    const startTime = Date.now();

    try {
      // OpenAI uses system message in the messages array
      const formattedMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Add system prompt if provided and not already in messages
      if (options.systemPrompt && !messages.find(m => m.role === 'system')) {
        formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
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
          provider: 'openai',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: { input: 0, output: 0, total: 0 },
          latency,
          error: `OpenAI API Error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      const content = data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        content,
        model,
        provider: 'openai',
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
        provider: 'openai',
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
        yield { type: 'error', error: `OpenAI API Error: ${response.status} - ${errorText}` };
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

      // Estimate tokens (OpenAI streaming doesn't provide usage)
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
}
