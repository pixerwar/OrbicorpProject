import { BaseLLMProvider, LLMMessage, LLMOptions, LLMResponse, StreamChunk, MessageContent, Tool, ToolUse } from '../llm-types.js';

export class AnthropicProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super(apiKey, 'anthropic');
  }

  // Convert our message format to Anthropic's format
  private formatContentForAnthropic(content: MessageContent): any {
    // If it's a simple string, return as-is
    if (typeof content === 'string') {
      return content;
    }

    // If it's an array of content parts, convert to Anthropic format
    return content.map((part: any) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.source.media_type,
            data: part.source.data,
          },
        };
      }
      if (part.type === 'document') {
        return {
          type: 'document',
          source: {
            type: 'base64',
            media_type: part.source.media_type,
            data: part.source.data,
          },
        };
      }
      // Tool use blocks (assistant messages with tool calls)
      if (part.type === 'tool_use') {
        return { type: 'tool_use', id: part.id, name: part.name, input: part.input };
      }
      // Tool result blocks (user messages with tool results)
      if (part.type === 'tool_result') {
        return { type: 'tool_result', tool_use_id: part.tool_use_id, content: part.content };
      }
      return { type: 'text', text: '[Unsupported content type]' };
    });
  }

  // Get system prompt content as string
  private getSystemPromptString(content: MessageContent): string {
    if (typeof content === 'string') {
      return content;
    }
    // If multimodal, extract text parts
    return content
      .filter(part => part.type === 'text')
      .map(part => (part as { type: 'text'; text: string }).text)
      .join('\n');
  }

  async chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse> {
    const model = options.model || this.config.defaultModel;
    const startTime = Date.now();

    try {
      // Separate system message from conversation
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Get system prompt as string
      const systemPrompt = systemMessage 
        ? this.getSystemPromptString(systemMessage.content)
        : (options.systemPrompt || '');

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
          system: systemPrompt,
          messages: conversationMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: this.formatContentForAnthropic(m.content),
          })),
          ...(options.tools && options.tools.length > 0 && { tools: options.tools }),
        }),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          content: '',
          model,
          provider: 'anthropic',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: { input: 0, output: 0, total: 0 },
          latency,
          error: `Anthropic API Error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;

      const content = data.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');

      return {
        success: true,
        content,
        model,
        provider: 'anthropic',
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
        provider: 'anthropic',
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

      // Get system prompt as string
      const systemPrompt = systemMessage 
        ? this.getSystemPromptString(systemMessage.content)
        : (options.systemPrompt || '');

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
          stream: true,
          system: systemPrompt,
          messages: conversationMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: this.formatContentForAnthropic(m.content),
          })),
          ...(options.tools && options.tools.length > 0 && {
            tools: options.tools,
            tool_choice: { type: 'auto' },
          }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        yield { type: 'error', error: `Anthropic API Error: ${response.status} - ${errorText}` };
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
      let inputTokens = 0;
      let outputTokens = 0;

      // Tool use tracking — per content block
      interface PendingToolUse {
        id: string;
        name: string;
        inputJson: string;
      }
      let pendingTools: Map<number, PendingToolUse> = new Map();

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

              // Debug: log non-delta events
              if (parsed.type !== 'content_block_delta' && parsed.type !== 'ping') {
                console.log('[Anthropic SSE]', parsed.type, parsed.content_block?.type || '', parsed.delta?.stop_reason || '');
              }

              // Text delta
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
                yield { type: 'chunk', content: parsed.delta.text };
              }

              // Tool use block starts
              if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                const idx = parsed.index as number;
                pendingTools.set(idx, {
                  id: parsed.content_block.id,
                  name: parsed.content_block.name,
                  inputJson: '',
                });
                console.log('[Anthropic] tool_use block started:', parsed.content_block.name, 'index:', idx);
              }

              // Tool input JSON delta
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
                const idx = parsed.index as number;
                const pending = pendingTools.get(idx);
                if (pending) {
                  pending.inputJson += parsed.delta.partial_json || '';
                }
              }

              // Content block stop — finalize tool if this index was a tool block
              if (parsed.type === 'content_block_stop') {
                const idx = parsed.index as number;
                const pending = pendingTools.get(idx);
                if (pending) {
                  let toolInput = {};
                  try { toolInput = JSON.parse(pending.inputJson || '{}'); } catch {}

                  const toolUse: ToolUse = {
                    type: 'tool_use',
                    id: pending.id,
                    name: pending.name,
                    input: toolInput,
                  };
                  console.log('[Anthropic] tool_use finalized:', pending.name, 'input:', JSON.stringify(toolInput));
                  yield { type: 'tool_use', tool_use: toolUse };
                  pendingTools.delete(idx);
                }
              }

              if (parsed.type === 'message_delta') {
                if (parsed.usage) outputTokens = parsed.usage.output_tokens || 0;
                if (parsed.delta?.stop_reason) console.log('[Anthropic] stop_reason:', parsed.delta.stop_reason);
              }

              if (parsed.type === 'message_start' && parsed.message?.usage) {
                inputTokens = parsed.message.usage.input_tokens || 0;
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
