import { BaseLLMProvider, LLMMessage, LLMOptions, LLMResponse, StreamChunk } from '../llm-types.js';

export class GoogleProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super(apiKey, 'google');
  }

  private getEndpoint(model: string, stream: boolean = false): string {
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    return `${this.config.endpoint}/${model}:${action}?key=${this.apiKey}`;
  }

  async chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
    const model = options.model || this.config.defaultModel;
    const startTime = Date.now();

    try {
      // Convert messages to Gemini format
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const contents = conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const requestBody: any = {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
        },
      };

      // Add system instruction if present
      if (systemMessage?.content || options.systemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: systemMessage?.content || options.systemPrompt }],
        };
      }

      const response = await fetch(this.getEndpoint(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          content: '',
          model,
          provider: 'google',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: { input: 0, output: 0, total: 0 },
          latency,
          error: `Gemini API Error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();
      
      const content = data.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .join('') || '';

      const inputTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

      return {
        success: true,
        content,
        model,
        provider: 'google',
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
        provider: 'google',
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
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const contents = conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const requestBody: any = {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
        },
      };

      if (systemMessage?.content || options.systemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: systemMessage?.content || options.systemPrompt }],
        };
      }

      const response = await fetch(this.getEndpoint(model, true) + '&alt=sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield { type: 'error', error: `Gemini API Error: ${response.status} - ${errorText}` };
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
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              
              if (text) {
                totalContent += text;
                yield { type: 'chunk', content: text };
              }

              if (parsed.usageMetadata) {
                inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens;
                outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      yield {
        type: 'done',
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        cost: this.calculateCost(inputTokens, outputTokens, model),
      };
    } catch (error) {
      yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
