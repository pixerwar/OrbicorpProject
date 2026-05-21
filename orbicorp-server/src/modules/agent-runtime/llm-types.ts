// LLM Provider Types and Interfaces

// Content types for multimodal messages
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string; // e.g., 'image/jpeg', 'image/png'
    data: string; // base64 encoded
  };
}

export interface DocumentContent {
  type: 'document';
  source: {
    type: 'base64';
    media_type: string; // e.g., 'application/pdf'
    data: string;
  };
  // Extracted text for models that don't support native PDF
  extractedText?: string;
}

export type MessageContent = string | (TextContent | ImageContent | DocumentContent)[];

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  systemPrompt?: string;
  tools?: Tool[];
}

// Tool/Function Calling Types
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// Agent Tools - built-in tools for agents
export const AGENT_TOOLS: Tool[] = [
  {
    name: 'create_task',
    description: 'Yeni bir görev oluşturur. Kullanıcı bir iş yapmanı istediğinde, takip edilmesi gereken uzun süreli işler için veya planlı görevler için bu aracı kullan.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Görev adı (kısa ve açıklayıcı)',
        },
        description: {
          type: 'string',
          description: 'Görevin detaylı açıklaması',
        },
        priority: {
          type: 'string',
          description: 'Görev önceliği',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'list_tasks',
    description: 'Aktif görevleri listeler. Kullanıcı görevleri sormak istediğinde kullan.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filtrelenecek görev durumu (opsiyonel)',
          enum: ['RUNNING', 'PENDING', 'APPROVAL', 'COMPLETED', 'FAILED'],
        },
      },
    },
  },
  {
    name: 'update_task',
    description: 'Mevcut bir görevi günceller (ilerleme, durum, log ekle).',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Güncellenecek görevin ID\'si',
        },
        progress: {
          type: 'number',
          description: 'Yeni ilerleme yüzdesi (0-100)',
        },
        status: {
          type: 'string',
          description: 'Yeni durum',
          enum: ['RUNNING', 'COMPLETED', 'FAILED'],
        },
        log_message: {
          type: 'string',
          description: 'Eklenecek log mesajı',
        },
      },
      required: ['task_id'],
    },
  },
];

// Yeni tool'lar — plan_task ve ask_user
// Bu tool'lar AGENT_TOOLS'a eklenir ki LLM bunları çağırabilsin
// Browser Tools — Puppeteer tabanlı web otomasyon araçları
export const BROWSER_TOOLS: Tool[] = [
  {
    name: 'browse_web',
    description: 'Bir web sayfasına git ve içeriğini oku. URL vererek sayfayı açar, başlığını ve ana içeriğini döndürür.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Gidilecek URL (https://... ile başlamalı)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_current_page',
    description: 'Şu an açık olan sayfanın içeriğini, formlarını, butonlarını ve linklerini okur. browse_web veya navigate ile sayfa açtıktan sonra kullan.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'fill_form',
    description: 'Sayfadaki form alanlarını doldurur. Alan adı (name attribute veya CSS selector) ve değer çiftleri ver.',
    input_schema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description: 'Doldurulacak alanlar: { "alan_adı_veya_selector": "değer", ... }',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'click_button',
    description: 'Sayfadaki bir butona tıklar. Buton metnini ver, metin eşleşen ilk butona tıklanır.',
    input_schema: {
      type: 'object',
      properties: {
        button_text: {
          type: 'string',
          description: 'Tıklanacak butonun metni (örn: "Giriş Yap", "Gönder", "Ara")',
        },
      },
      required: ['button_text'],
    },
  },
  {
    name: 'navigate',
    description: 'Belirtilen URL\'ye git. browse_web ile aynı ancak zaten açık bir oturumda farklı bir sayfaya gitmek için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Gidilecek URL',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'click_element',
    description: 'CSS selector ile bir elemente tıklar. Buton dışı elementler (link, checkbox, vb.) için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Tıklanacak elementin CSS selector\'ı (örn: "a.login-link", "#submit-btn")',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'screenshot',
    description: 'Şu an açık olan sayfanın ekran görüntüsünü alır. Sayfanın görsel durumunu kontrol etmek için kullan.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'close_browser',
    description: 'Açık browser oturumunu kapatır. İşlem bittiğinde kaynakları serbest bırakmak için kullan.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

export const EXTENDED_AGENT_TOOLS: Tool[] = [
  ...AGENT_TOOLS,
  ...BROWSER_TOOLS,
  {
    name: 'plan_task',
    description: 'Karmaşık bir görevi başlatmadan önce adım adım planı kullanıcıya gösterir ve onay ister. Kullanıcı birden fazla adım gerektiren bir iş istediğinde, önce bu tool ile planı sun, onaylandıktan sonra create_task ile görevi oluştur.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Planın başlığı',
        },
        description: {
          type: 'string',
          description: 'Ne yapılacağının kısa açıklaması',
        },
        steps: {
          type: 'array',
          description: 'Görevin adımları (en az 2, en fazla 8)',
          items: {
            type: 'object',
            properties: {
              id:          { type: 'string', description: 'Adım ID (step-1, step-2 vb.)' },
              title:       { type: 'string', description: 'Adım başlığı' },
              description: { type: 'string', description: 'Adımın detayı (opsiyonel)' },
              tool:        { type: 'string', description: 'Bu adımda kullanılacak tool adı (opsiyonel)' },
              duration:    { type: 'string', description: 'Tahmini süre (~2 dk, otomatik vb.) (opsiyonel)' },
            },
            required: ['id', 'title'],
          },
        },
        priority: {
          type: 'string',
          description: 'Görev önceliği',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        estimatedDuration: {
          type: 'string',
          description: 'Toplam tahmini süre (opsiyonel)',
        },
      },
      required: ['title', 'description', 'steps'],
    },
  },
  {
    name: 'ask_user',
    description: 'Kullanıcıya seçenekli bir soru sorar ve cevabını bekler. Departman seçimi, öncelik belirleme, yöntem seçimi gibi kullanıcı kararı gerektiren durumlarda kullan. Kullanıcı seçim yaptıktan sonra devam et.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Kullanıcıya sorulacak soru',
        },
        context: {
          type: 'string',
          description: 'Sorunun bağlamı veya neden sorulduğu (opsiyonel)',
        },
        options: {
          type: 'array',
          description: 'Seçenekler (en az 2, en fazla 8)',
          items: {
            type: 'object',
            properties: {
              id:          { type: 'string', description: 'Seçenek ID' },
              label:       { type: 'string', description: 'Seçenek metni' },
              description: { type: 'string', description: 'Seçeneğin açıklaması (opsiyonel)' },
              icon:        { type: 'string', description: 'Emoji veya ikon (opsiyonel)' },
            },
            required: ['id', 'label'],
          },
        },
        allowMultiple: {
          type: 'boolean',
          description: 'Birden fazla seçenek seçilebilir mi (varsayılan: false)',
        },
      },
      required: ['question', 'options'],
    },
  },
];

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMCost {
  input: number;
  output: number;
  total: number;
}

export interface LLMResponse {
  success: boolean;
  content: string;
  model: string;
  provider: string;
  usage: LLMUsage;
  cost: LLMCost;
  latency: number;
  error?: string;
}

export interface StreamChunk {
  type: 'start' | 'chunk' | 'done' | 'error' | 'tool_use';
  content?: string;
  usage?: LLMUsage;
  cost?: LLMCost;
  error?: string;
  tool_use?: ToolUse;
}

export interface ModelConfig {
  id: string;
  name: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxTokens: number;
  contextWindow: number;
}

export interface ProviderConfig {
  name: string;
  endpoint: string;
  models: ModelConfig[];
  defaultModel: string;
}

// Provider configurations
export const LLM_PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', costPer1kInput: 0.015, costPer1kOutput: 0.075, maxTokens: 4096, contextWindow: 200000 },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 8192, contextWindow: 200000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', costPer1kInput: 0.00025, costPer1kOutput: 0.00125, maxTokens: 8192, contextWindow: 200000 },
    ],
    defaultModel: 'claude-sonnet-4-6',
  },
  openai: {
    name: 'OpenAI (GPT)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', costPer1kInput: 0.005, costPer1kOutput: 0.015, maxTokens: 4096, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 16384, contextWindow: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', costPer1kInput: 0.01, costPer1kOutput: 0.03, maxTokens: 4096, contextWindow: 128000 },
    ],
    defaultModel: 'gpt-4o',
  },
  google: {
    name: 'Google (Gemini)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', costPer1kInput: 0.00125, costPer1kOutput: 0.005, maxTokens: 8192, contextWindow: 1000000 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', costPer1kInput: 0.000075, costPer1kOutput: 0.0003, maxTokens: 8192, contextWindow: 1000000 },
      { id: 'gemini-pro', name: 'Gemini Pro', costPer1kInput: 0.0005, costPer1kOutput: 0.0015, maxTokens: 8192, contextWindow: 32000 },
    ],
    defaultModel: 'gemini-1.5-pro',
  },
};

// Base provider class
export abstract class BaseLLMProvider {
  protected apiKey: string;
  protected config: ProviderConfig;

  constructor(apiKey: string, providerName: string) {
    this.apiKey = apiKey;
    this.config = LLM_PROVIDERS[providerName];
    if (!this.config) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  protected getModelConfig(modelId: string): ModelConfig | undefined {
    return this.config.models.find(m => m.id === modelId);
  }

  protected calculateCost(inputTokens: number, outputTokens: number, modelId: string): LLMCost {
    const model = this.getModelConfig(modelId);
    if (!model) return { input: 0, output: 0, total: 0 };

    const input = (inputTokens / 1000) * model.costPer1kInput;
    const output = (outputTokens / 1000) * model.costPer1kOutput;
    return { input, output, total: input + output };
  }

  abstract chat(messages: LLMMessage[], options: LLMOptions): Promise<LLMResponse>;
  abstract chatStream(messages: LLMMessage[], options: LLMOptions): AsyncGenerator<StreamChunk>;
}
