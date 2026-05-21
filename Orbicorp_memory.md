# Orbicorp — Proje Hafızası
**Son Güncelleme:** 2026-04-05  
**Versiyon:** Tool UI + Activity Card sistemi

---

## 1. Proje Tanımı

Orbicorp, kurumsal AI agent yönetim platformudur. Şirketler kendi AI asistanlarını oluşturabilir, görevler atayabilir, workflow tanımlayabilir, Telegram/WhatsApp üzerinden agent'larıyla iletişim kurabilir.

**Demo Bilgileri:**
```
Email:    admin@novatech.com.tr
Password: admin123
Şirket:   NovaTech Solutions A.Ş. (slug: novatech)
```

**URL'ler:**
```
Frontend:  http://localhost:8000
API:       http://localhost:3001/api/v1
Swagger:   http://localhost:3001/docs
```

---

## 2. Teknoloji Stack

### Backend
| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| Node.js | 18+ | Runtime |
| TypeScript | 5.x | Dil |
| Fastify | 4.x | Web Framework |
| Prisma | 5.x | ORM |
| PostgreSQL | 15+ | Veritabanı |
| Zod | 3.x | Schema validasyonu |
| JWT | — | Authentication |

### Frontend
| Teknoloji | Kullanım |
|-----------|----------|
| Vanilla HTML/CSS/JS | Tüm UI |
| iframe yapısı | Sayfa geçişleri (index.html → alt sayfalar) |
| CSS Variables | Light/dark tema |
| Fetch API + SSE | HTTP + streaming |
| marked.js 9.1.6 | Markdown render |
| DOMPurify 3.1.6 | XSS koruması |

### LLM Provider'ları
| Provider | Desteklenen Modeller |
|----------|---------------------|
| Anthropic | claude-sonnet-4-20250514, claude-haiku-4-5-20251001, claude-opus-4 |
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo |
| Google | gemini-1.5-pro, gemini-1.5-flash |
| OpenRouter | Çeşitli modeller |

### Mesajlaşma
| Kanal | Entegrasyon |
|-------|-------------|
| Telegram | Bot API + Polling/Webhook |
| WhatsApp | Cloud API |
| WebChat | Native |

---

## 3. Klasör Yapısı

```
orbicorp-full/
├── orbicorp-frontend\
│   ├── index.html                  # Ana layout (iframe container)
│   ├── orbicorp-login.html
│   ├── orbicorp-dashboard.html
│   ├── orbicorp-chat.html          # ⭐ Ana geliştirme dosyası
│   ├── orbicorp-agents.html
│   ├── orbicorp-tasks.html
│   ├── orbicorp-workflow.html
│   ├── orbicorp-settings.html
│   ├── orbicorp-knowledge.html
│   ├── orbicorp-history.html
│   ├── orbicorp-analytics.html
│   ├── orbicorp-company.html
│   ├── orbicorp-market.html
│   ├── orbicorp-users.html
│   ├── orbicorp-api.js             # API client singleton
│   ├── orbicorp-dark.css           # Dark tema
│   └── i18n.js                     # Çoklu dil
│
└── orbicorp-server\src\modules\
    ├── agent-runtime\
    │   ├── agent-runtime.service.ts  # ⭐ Ana runtime + tool execution
    │   ├── llm-manager.ts
    │   ├── llm-types.ts              # ⭐ Tool tanımları + EXTENDED_AGENT_TOOLS
    │   ├── tool-schemas.ts           # ⭐ Zod şemaları (YENİ)
    │   └── file-processor.ts
    ├── sessions\
    │   ├── sessions.routes.ts        # ⭐ SSE stream + tool events
    │   └── sessions.service.ts
    ├── agents\, auth\, users\, companies\
    ├── tasks\, workflows\, channels\
    ├── notifications\, messaging\, dashboard\
    └── uploads\
```

---

## 4. Kurulum Komutları

```powershell
# Backend
cd orbicorp-full/orbicorp-server
docker compose up -d
npm install
npx prisma migrate dev --name init
npx prisma db seed
npx tsx --no-cache src/index.ts   # ÖNEMLİ: --no-cache kullan!

# Frontend (ayrı terminal)
cd ..\orbicorp-frontend
npx serve . -p 8000
```

---

## 5. Veritabanı Şeması (Kritik Notlar)

### Önemli Prisma Modelleri

```prisma
model Agent {
  id            String      @id @default(uuid())
  companyId     String
  name          String
  isMain        Boolean     @default(false)
  modelProvider String?     # 'anthropic' | 'openai' | 'google' | 'openrouter'
  modelId       String?
  systemPrompt  String?     @db.Text
  temperature   Float       @default(0.7)
  maxTokens     Int         @default(2000)
  tools         Json        @default("[]")  # ['browse_web', 'fill_form', ...]
  status        AgentStatus @default(ACTIVE)
  stats         Json
  notificationChannelId String?
}

model Session {
  # NOT: createdAt yok → startedAt kullan!
  startedAt     DateTime    @default(now())
}

model Task {
  # NOT: agentId string field var ama agent RELATION YOK
  agentId       String
}

model Message {
  role          MessageRole  # 'USER' | 'ASSISTANT' (büyük harf!)
}
```

### Enum'lar
```prisma
enum UserRole        { ADMIN, OPERATOR, VIEWER }
enum AgentStatus     { ACTIVE, PAUSED, MAINTENANCE }
enum MessageRole     { USER, ASSISTANT }  # Backend büyük harf döner!
enum PackageType     { SKILL, TOOL, AGENT_TEMPLATE, LANGUAGE_PACK, WORKFLOW_TEMPLATE }
enum PricingModel    { FREE, ONE_TIME, SUBSCRIPTION }
```

### Seed Agent ID Formatı
```
${companyId}-main-agent  # UUID değil, string!
```

---

## 6. Authentication Sistemi

```typescript
// JWT Payload
interface JWTPayload {
  userId: string;
  companyId: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

// Middleware kullanımı
import { authMiddleware, requireAdmin, requireOperator } from '../shared/middleware/auth.js';

// Fastify request'te user
request.user.companyId
request.user.userId
request.user.role
```

**Token Süreleri:**
- Access token: 2 saat
- Refresh token: 7 gün

**LocalStorage Keys:**
```
orbicorp_access_token
orbicorp_refresh_token
```

---

## 7. API Endpoint'leri

```
Auth:          POST /auth/login|register|refresh|logout, GET /auth/me
Agents:        GET/POST /agents, GET /agents/main, GET/PUT/DELETE /agents/:id
               POST /agents/:id/pause|resume, GET /agents/:id/stats
Sessions:      GET/POST /sessions, GET /sessions/:id
               GET /sessions/:id/messages
               GET /sessions/:id/chat/stream (SSE — ana chat endpoint)
Company:       GET/PUT /company, GET/PUT /company/llm-config
LLM:           GET /llm/status, GET /llm/providers, POST /llm/test
Tasks:         GET/POST /tasks, GET/PUT/DELETE /tasks/:id, GET /tasks/stats
Workflows:     GET/POST /workflows, GET/PUT/DELETE /workflows/:id
Channels:      GET/POST /channels, GET/PUT/DELETE /channels/:id, POST /channels/:id/test
Notifications: GET /notifications, GET /notifications/count, POST /notifications/:id/respond
Dashboard:     GET /dashboard/stats|activity|top-agents|model-usage
Market:        GET /market, POST /market/install, GET /market/installed
               POST /market/agents/:agentId/packages
```

---

## 8. SSE Stream Formatı (sessions.routes.ts)

```
event: start       → stream başladı
event: chunk       → data: { content: "metin" }
event: tool_calling → data: { id, name, displayName, input }  (opsiyonel)
event: tool_result  → data: { id, name, success, message, data }  (opsiyonel)
event: done        → stream bitti
event: error       → data: { message: "hata" }
```

**Önemli:** Chrome tool'ları (browse_web, fill_form, vb.) SSE event olarak değil, `chunk` içine gömülü text olarak geliyor:
```
🔧 *fill_form*
<!--TOOL_START-->
<div class="tool-card">...</div>
<!--TOOL_END-->
```

---

## 9. Agent Tool Sistemi

### llm-types.ts — Tool Tanımları

```typescript
AGENT_TOOLS         // create_task, list_tasks, update_task
EXTENDED_AGENT_TOOLS // + plan_task, ask_user (YENİ)
```

### executeAgentTool — Çalışan Case'ler (agent-runtime.service.ts)

| Tool | Çıktı Formatı |
|------|--------------|
| `create_task` | Zod → `approval-card` JSON |
| `list_tasks` | Zod → `data-table` JSON |
| `update_task` | Zod → `progress-tracker` JSON |
| `plan_task` | Zod → `plan-card` JSON (YENİ) |
| `ask_user` | Zod → `option-list` JSON (YENİ) |

### tool-schemas.ts — Zod Şemaları (YENİ)

```typescript
CreateTaskOutputSchema    → component: 'approval-card'
ListTasksOutputSchema     → component: 'data-table'
ProgressTrackerOutputSchema → component: 'progress-tracker'
PlanCardOutputSchema      → component: 'plan-card'
OptionListOutputSchema    → component: 'option-list'
ErrorOutputSchema         → component: 'error-card'
ToolOutputSchema          → discriminatedUnion (tümü)
```

### Claude in Chrome Tool'ları (sadece frontend render, backend'de case yok)

```
browse_web, fill_form, click_button, read_current_page,
navigate, scroll, screenshot, close_browser
```

---

## 10. Frontend — orbicorp-chat.html (Ana Geliştirme Dosyası)

### Kritik State Değişkenleri

```javascript
let agents = [];           // Agent listesi
let sessions = [];         // Session listesi
let currentAgentId = null; // Seçili agent
let currentSessionId = null;
let currentMessages = [];  // Mesaj geçmişi
let isStreaming = false;
let userInfo = null;       // /auth/me sonucu
let llmConfig = null;
let mainAgent = null;

// Tool UI State
let _activityCardId = null;   // Activity Card DOM id
let _activitySteps = [];       // Chrome tool adımları
let _activityCollapsed = false;
let _seenToolKeys = new Set(); // Duplicate önleme
```

### TOOL_REGISTRY

```javascript
const TOOL_REGISTRY = {
  create_task:       'approval-card',
  list_tasks:        'data-table',
  update_task:       'progress-tracker',
  plan_task:         'plan-card',
  ask_user:          'option-list',
  fill_form:         'chrome-tool',
  click_button:      'chrome-tool',
  read_current_page: 'chrome-tool',
  read_page:         'chrome-tool',
  navigate:          'chrome-tool',
  browse_web:        'chrome-tool',  // Activity Card'a dahil
  // ...diğer chrome tool'lar
};
```

### Tool UI Bileşenleri

| Bileşen | CSS Class | Tetikleyici |
|---------|-----------|------------|
| Approval Card | `.approval-card` | `create_task` |
| Data Table | `.data-table-card` | `list_tasks` |
| Progress Tracker | `.progress-tracker-card` | `update_task` |
| Plan Card | `.plan-card` | `plan_task` |
| Option List | `.option-list-card` | `ask_user` |
| Activity Card | `.activity-card` | Chrome tool'lar (streaming detect) |
| Browse Web Card | `.browse-web-card` | `browse_web` (finalize sonrası) |
| Error Card | `.error-card` | Hata durumları |

### Streaming Akışı

```
kullanıcı mesaj gönderir
→ resetActivityCard()
→ addTypingIndicator()
→ SSE chunk gelir
  → content chunk ise:
    → updateStreamingMessage(fullContent)
      → detectAndUpdateActivityCard() — 🔧 emoji detect → Activity Card günceller
      → extractNonToolText() — tool bloklarını çıkarır
      → bubble'a sadece düz text yazar
  → done gelince:
    → finalizeStreamingMessage()
      → finalizeActivityCardSteps() — tüm adımları done yap
      → extractTextAfterTools() — <!--TOOL_END--> sonrası text
      → postProcessAIMessage() — markdown + tool kart render
```

### Kritik Bug Fix'ler

```javascript
// Backend büyük harf döner, küçük harf bekliyor — ÇÖZÜLDÜ
const isUser = msg.role?.toLowerCase() === 'user';

// Yorum satırında literal newline → JS syntax hatası — ÇÖZÜLDÜ
// "..." yorum tek satıra sıkıştırıldı

// Regex unicode flag
const re = /[\u{1F527}\u{1F6E0}\u26CF]\s*\*([\w_]+)\*/gu;
```

### Önemli Fonksiyonlar

```javascript
renderMessages()              // currentMessages'ı DOM'a yazar
addMessageToUI(role, content) // Tek mesaj ekler
updateStreamingMessage(text)  // Streaming günceller
finalizeStreamingMessage(text)// Stream bitti, final render
detectAndUpdateActivityCard() // Streaming sırasında tool detect
finalizeActivityCardSteps()   // Tüm adımları done yap
renderActivityCard()          // Activity Card DOM render
resetActivityCard()           // Her yeni mesajda sıfırla
postProcessAIMessage(text)    // Markdown + tool kart parse
parseChromeToolBlock()        // HTML veya düz text parse
buildChromeToolCard()         // Chrome tool kartı HTML üret
renderToolResult()            // component field'a göre dispatch
sendAutoMessage(text)         // Seçenek C — option/plan onayı
```

---

## 11. Tamamlanan Geliştirmeler (Kronolojik)

### 2026-03-29: Temel Platform
- JWT auth sistemi
- Multi-provider LLM (Anthropic, OpenAI, Google, OpenRouter)
- Agent CRUD + tool atama
- Chat + SSE streaming
- Telegram entegrasyonu (polling + webhook)
- Task yönetimi (timeline view)
- i18n TR/EN

### 2026-03-30: Skill Market
- MarketPackage, PackageInstallation, AgentPackage tabloları
- 14 market endpoint
- 8 seed paket (memory-tools, multi-agent, task-manager, vb.)
- package-runtime.service.ts
- Frontend market sayfası
- Agent sayfasına paket yönetimi

### 2026-04-02: Tool Atama UI
- Agents sayfasında Kaynaklar tabı
- 5 kategoride 19 tool checkbox grid
- PUT /agents/:id → { tools: [...] }
- getToolsForAgent() helper

### 2026-04-04 → 2026-04-05: Tool UI (Ana Geliştirme)

**Backend:**
- `tool-schemas.ts` — 6 Zod şeması
- `llm-types.ts` — EXTENDED_AGENT_TOOLS (plan_task + ask_user)
- `agent-runtime.service.ts` — Zod çıktılı tool case'leri
- `sessions.routes.ts` — tool_calling/tool_result SSE event'leri

**Frontend (orbicorp-chat.html):**
- marked.js + DOMPurify CDN eklendi
- Markdown render (renderMarkdown + postProcessAIMessage)
- TOOL_REGISTRY sistemi
- 5 backend tool bileşeni (Approval, DataTable, ProgressTracker, PlanCard, OptionList)
- Chrome tool kart sistemi (HTML + düz text format desteği)
- Browse Web Card
- Activity Card sistemi (streaming sırasında canlı detect)
- Stream loop'a tool_calling/tool_result event desteği
- USER/user case insensitive fix (msg.role?.toLowerCase())
- <!--TOOL_END--> sonrası içerik ayrıştırma
- Seçenek C: option-list ve plan onayı → sendAutoMessage()
- Collapse/expand toggle (Activity Card)

---

## 12. Frontend-Backend Entegrasyon Durumu

### ✅ Backend'e Bağlı
- Dashboard, Agents, Chat, Settings (LLM + Kanallar)
- Workflow, Tasks, Channels, Notifications
- Market, Topbar Bildirimler

### ❌ Backend'e Bağlanmamış (Demo/Statik veri)
- Company, Analytics, Knowledge, History, Users

---

## 13. Bilinen Sorunlar

### 🔴 Browser Tool Hatası (AÇIK)
```
Hata: Cannot read properties of undefined (reading 'create')
Kaynak: Claude in Chrome browser extension
Etki: browse_web, fill_form, click_button çalışmıyor
Çözüm: Extension'ı güncelle/yeniden yükle
```

### 🟡 Activity Card Test Edilemedi
- Browser tool hatası nedeniyle fill_form/click_button çağrılamıyor
- browse_web (Activity Card'a dahil) hata veriyor
- Kod doğru, syntax temiz — browser düzelince test edilecek

### 🟢 Çözüldü
- USER/user büyük-küçük harf uyumsuzluğu → toLowerCase()
- JS syntax hatası (yorum satırındaki literal newline)
- agent dropdown boş gelme → agents listesi ACTIVE filtreli çekiliyor
- Kullanıcı mesajları agent gibi görünme → isUser fix

---

## 14. Önemli Notlar & Tuzaklar

```javascript
// 1. Backend role büyük harf döner
msg.role?.toLowerCase() === 'user'  // Doğru
msg.role === 'user'                 // YANLIŞ

// 2. Server başlatırken --no-cache şart
npx tsx --no-cache src/index.ts

// 3. iframe context — console'da frame seç
// top frame'de değil, orbicorp-chat.html frame'inde çalıştır

// 4. Hard refresh ile cache temizle
Ctrl+Shift+R

// 5. Prisma Session modeli
session.startedAt  // createdAt YOK!

// 6. Tool output component field'ı
data.component  // 'approval-card' | 'data-table' | 'progress-tracker' | 'plan-card' | 'option-list' | 'error-card'

// 7. Chrome tool format iki türlü gelir
// Format A: <div class="tool-card">...</div>
// Format B: "Başarılı - Form Dolduruldu\nAlan: q\nDeğer: ..."
// parseChromeToolBlock() her ikisini de handle eder

// 8. Regex unicode emojiler için u flag şart
/[\u{1F527}]\s*\*([\w_]+)\*/gu  // u flag olmadan çalışmaz
```

---

## 15. Sonraki Adımlar (TODO)

- [ ] Browser tool hatasını çöz (Claude in Chrome extension)
- [ ] Activity Card'ı test et (browser düzelince)
- [ ] Company sayfasını backend'e bağla
- [ ] Analytics sayfasını backend'e bağla
- [ ] Knowledge (RAG) sayfasını backend'e bağla
- [ ] History sayfasını backend'e bağla
- [ ] Users sayfasını backend'e bağla
- [ ] Settings'te kart yönetimi UI

---

## 16. Renk Paleti (CSS Variables)

```css
--primary:        #635BFF
--primary-light:  #7A73FF
--primary-bg:     #F0EFFF
--navy:           #0A2540
--green:          #10B981
--green-bg:       #ECFDF5
--green-text:     #065F46
--red:            #EF4444
--red-bg:         #FEF2F2
--red-text:       #991B1B
--amber:          #F59E0B
--amber-bg:       #FFFBEB
--amber-text:     #92400E
--surface:        #F7F7F8
--border:         #E5E5E7
--border-light:   #F0F0F2
--text-primary:   #1A1A2E
--text-secondary: #6B7280
--text-muted:     #9CA3AF
--text-tertiary:  #D1D5DB
--white:          #FFFFFF
--font:           'Google Sans', sans-serif
--font-mono:      'Google Sans Mono', monospace
--radius-sm:      6px
--radius-md:      10px
--radius-lg:      14px
--transition:     0.15s ease
```
