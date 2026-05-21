# 🏢 Orbicorp - Kurumsal AI Agent Yönetim Platformu

## 📋 Proje Özeti

**Orbicorp**, şirketlerin AI agent'larını merkezi olarak yönetmelerine olanak tanıyan kurumsal bir platformdur. Multi-tenant yapıda çalışır, her şirket kendi agent'larını, kullanıcılarını ve entegrasyonlarını yönetebilir.

---

## 🛠️ Teknoloji Stack

### Backend
| Teknoloji | Versiyon | Kullanım |
|-----------|----------|----------|
| Node.js | 18+ | Runtime |
| TypeScript | 5.x | Dil |
| Fastify | 4.x | Web Framework |
| Prisma | 5.x | ORM |
| PostgreSQL | 15+ | Veritabanı |
| Zod | 3.x | Validasyon |
| JWT | - | Authentication |

### Frontend
| Teknoloji | Kullanım |
|-----------|----------|
| Vanilla HTML/CSS/JS | UI |
| iframe yapısı | Sayfa geçişleri |
| CSS Variables | Tema desteği (light/dark) |
| Fetch API | HTTP istekleri |

### AI/LLM Entegrasyonları
| Provider | Modeller |
|----------|----------|
| Anthropic | claude-sonnet-4-20250514, claude-haiku, claude-opus |
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo |
| Google | gemini-1.5-pro, gemini-1.5-flash |
| OpenRouter | Çeşitli modeller |

### Mesajlaşma Kanalları
| Kanal | Entegrasyon |
|-------|-------------|
| Telegram | Bot API + Polling |
| WhatsApp | Cloud API |
| WebChat | Native |

---

## 📁 Proje Klasör Yapısı

```
orbicorp-full/
├── orbicorp-frontend\              # Frontend (statik dosyalar)
│   ├── index.html                  # Ana layout (iframe container)
│   ├── orbicorp-login.html         # Login sayfası
│   ├── orbicorp-dashboard.html     # Dashboard
│   ├── orbicorp-agents.html        # Agent yönetimi
│   ├── orbicorp-chat.html          # Chat arayüzü
│   ├── orbicorp-chat-rag.html      # RAG destekli chat
│   ├── orbicorp-market.html        # Skill Market
│   ├── orbicorp-users.html         # Kullanıcı yönetimi
│   ├── orbicorp-settings.html      # Ayarlar
│   ├── orbicorp-tasks.html         # Görev yönetimi
│   ├── orbicorp-workflow.html      # İş akışları
│   ├── orbicorp-knowledge.html     # Bilgi tabanı
│   ├── orbicorp-history.html       # Geçmiş
│   ├── orbicorp-analytics.html     # Analitik
│   ├── orbicorp-company.html       # Şirket profili
│   ├── orbicorp-api.js             # API client sınıfı
│   ├── orbicorp-dark.css           # Dark tema stilleri
│   └── i18n.js                     # Çoklu dil desteği
│
└── orbicorp-server\                # Backend
    ├── src\
    │   ├── app.ts                  # Fastify app builder
    │   ├── index.ts                # Entry point
    │   ├── config\
    │   │   └── index.ts            # Environment config
    │   ├── modules\
    │   │   ├── auth\               # Kimlik doğrulama
    │   │   │   ├── index.ts
    │   │   │   ├── auth.routes.ts
    │   │   │   ├── auth.schema.ts
    │   │   │   └── auth.service.ts
    │   │   ├── users\              # Kullanıcı yönetimi
    │   │   │   ├── index.ts
    │   │   │   ├── users.routes.ts
    │   │   │   ├── users.schema.ts
    │   │   │   └── users.service.ts
    │   │   ├── agents\             # Agent CRUD
    │   │   │   ├── index.ts
    │   │   │   ├── agents.routes.ts
    │   │   │   ├── agents.schema.ts
    │   │   │   └── agents.service.ts
    │   │   ├── agent-runtime\      # Agent çalışma zamanı
    │   │   │   ├── agent-runtime.service.ts  # Ana runtime
    │   │   │   ├── llm-manager.ts            # LLM yönetimi
    │   │   │   ├── llm-types.ts              # Tool tanımları
    │   │   │   ├── llm.routes.ts             # LLM API
    │   │   │   └── file-processor.ts         # Dosya işleme
    │   │   ├── market\             # Skill Market (YENİ)
    │   │   │   ├── index.ts
    │   │   │   ├── market.routes.ts
    │   │   │   ├── market.schema.ts
    │   │   │   ├── market.service.ts
    │   │   │   └── package-runtime.service.ts
    │   │   ├── sessions\           # Chat oturumları
    │   │   ├── channels\           # İletişim kanalları
    │   │   ├── messaging\          # Telegram/WhatsApp
    │   │   │   ├── telegram.service.ts
    │   │   │   ├── whatsapp.service.ts
    │   │   │   ├── messaging.service.ts
    │   │   │   └── webhooks.routes.ts
    │   │   ├── tasks\              # Görev yönetimi
    │   │   ├── workflows\          # İş akışları
    │   │   ├── notifications\      # Bildirimler
    │   │   ├── dashboard\          # Dashboard API
    │   │   ├── companies\          # Şirket yönetimi
    │   │   └── uploads\            # Dosya yükleme
    │   └── shared\
    │       ├── middleware\
    │       │   └── auth.ts         # JWT middleware
    │       ├── types\
    │       │   └── index.ts        # Ortak tipler
    │       └── utils\
    │           └── prisma.ts       # Prisma client
    ├── prisma\
    │   ├── schema.prisma           # Veritabanı şeması
    │   ├── seed.ts                 # Ana seed
    │   └── seed-market.ts          # Market seed
    ├── package.json
    ├── tsconfig.json
    └── .env                        # Environment variables
```

---

## 🗄️ Veritabanı Şeması (Önemli Tablolar)

### Temel Tablolar

```prisma
model Company {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  // ... relations
}

model User {
  id           String     @id @default(uuid())
  companyId    String
  email        String     @unique
  passwordHash String
  firstName    String?
  lastName     String?
  phone        String?              # YENİ
  department   String?              # YENİ
  role         UserRole   @default(VIEWER)  # ADMIN, OPERATOR, VIEWER
  status       UserStatus @default(ACTIVE)
  avatarUrl    String?
  // ... relations
}

model Agent {
  id            String      @id @default(uuid())
  companyId     String
  name          String
  description   String?
  department    String?
  isMain        Boolean     @default(false)
  modelProvider String?     # anthropic, openai, google, openrouter
  modelId       String?     # claude-sonnet-4-20250514, gpt-4o, etc.
  systemPrompt  String?     @db.Text
  temperature   Float       @default(0.7)
  maxTokens     Int         @default(2000)
  skills        String[]    @default([])
  tools         Json        @default("[]")
  channels      String[]    @default([])
  status        AgentStatus @default(ACTIVE)
  stats         Json        # { totalChats, successRate, avgResponseTime }
  notificationChannelId String?
  // ... relations: memories, packages
}

model AgentMemory {
  id        String     @id @default(uuid())
  agentId   String
  type      MemoryType  # FACT, PREFERENCE, LEARNING
  content   String     @db.Text
  metadata  Json       @default("{}")
  expiresAt DateTime?
}
```

### Skill Market Tabloları (YENİ)

```prisma
model MarketPackage {
  id           String        @id @default(uuid())
  companyId    String?       # null = global/official
  name         String        @unique
  displayName  String
  description  String?
  type         PackageType   # SKILL, TOOL, AGENT_TEMPLATE, LANGUAGE_PACK, WORKFLOW_TEMPLATE
  category     String        @default("custom")
  version      String        @default("1.0.0")
  icon         String?
  manifest     Json          # { tools, systemPromptAddition, config }
  pricingModel PricingModel  @default(FREE)
  price        Float         @default(0)
  status       PackageStatus @default(PUBLISHED)
  isOfficial   Boolean       @default(false)
  authorName   String?
  rating       Float         @default(0)
  reviewCount  Int           @default(0)
  installCount Int           @default(0)
  tags         String[]      @default([])
  providers    String[]      @default([])  # Uyumlu LLM providers
}

model PackageInstallation {
  id          String             @id @default(uuid())
  companyId   String
  packageId   String
  status      InstallationStatus @default(ACTIVE)  # ACTIVE, PAUSED, EXPIRED
  config      Json               @default("{}")
  installedAt DateTime           @default(now())
  // ... relations: package, agentPackages
}

model AgentPackage {
  id             String   @id @default(uuid())
  agentId        String
  installationId String
  isEnabled      Boolean  @default(true)
  config         Json     @default("{}")
}
```

### Enum Tanımları

```prisma
enum UserRole { ADMIN, OPERATOR, VIEWER }
enum UserStatus { ACTIVE, INACTIVE, SUSPENDED }
enum AgentStatus { ACTIVE, PAUSED, MAINTENANCE }
enum MemoryType { FACT, PREFERENCE, LEARNING }
enum PackageType { SKILL, TOOL, AGENT_TEMPLATE, LANGUAGE_PACK, WORKFLOW_TEMPLATE }
enum PricingModel { FREE, ONE_TIME, SUBSCRIPTION }
enum PackageStatus { DRAFT, PUBLISHED, DEPRECATED }
enum InstallationStatus { ACTIVE, PAUSED, EXPIRED }
```

---

## 🔌 API Endpoint'leri

### Authentication
```
POST /api/v1/auth/login          # Login
POST /api/v1/auth/register       # Register
POST /api/v1/auth/refresh        # Token refresh
POST /api/v1/auth/logout         # Logout
```

### Users
```
GET    /api/v1/users             # Liste
GET    /api/v1/users/:id         # Detay
POST   /api/v1/users             # Oluştur
PUT    /api/v1/users/:id         # Güncelle
DELETE /api/v1/users/:id         # Sil
```

### Agents
```
GET    /api/v1/agents            # Liste
GET    /api/v1/agents/main       # Main Agent
GET    /api/v1/agents/:id        # Detay
POST   /api/v1/agents            # Oluştur
PUT    /api/v1/agents/:id        # Güncelle
DELETE /api/v1/agents/:id        # Sil
POST   /api/v1/agents/:id/pause  # Duraklat
POST   /api/v1/agents/:id/resume # Devam ettir
```

### Sessions (Chat)
```
GET    /api/v1/sessions              # Liste
POST   /api/v1/sessions              # Yeni oturum
GET    /api/v1/sessions/:id          # Detay
GET    /api/v1/sessions/:id/messages # Mesajlar
POST   /api/v1/sessions/:id/messages # Mesaj gönder (streaming)
```

### Market (YENİ)
```
GET    /api/v1/market                           # Paket listesi
GET    /api/v1/market/:id                       # Paket detay
GET    /api/v1/market/meta/categories           # Kategoriler
POST   /api/v1/market/install                   # Paket kur
DELETE /api/v1/market/uninstall/:id             # Paket kaldır
GET    /api/v1/market/installed                 # Kurulu paketler
PATCH  /api/v1/market/installed/:id/status      # Durum değiştir
POST   /api/v1/market/agents/:agentId/packages  # Agent'a ata
GET    /api/v1/market/agents/:agentId/packages  # Agent paketleri
DELETE /api/v1/market/agents/:agentId/packages/:apId  # Agent'tan kaldır
PATCH  /api/v1/market/agents/:agentId/packages/:apId  # Agent paket ayarı
```

### LLM
```
GET  /api/v1/llm/config          # Provider ayarları
POST /api/v1/llm/config          # Provider kaydet
GET  /api/v1/llm/models          # Mevcut modeller
```

### Channels
```
GET    /api/v1/channels          # Liste
POST   /api/v1/channels          # Oluştur
PUT    /api/v1/channels/:id      # Güncelle
DELETE /api/v1/channels/:id      # Sil
```

---

## 🧠 Agent Runtime & Tools

### Yerleşik Tool'lar (llm-types.ts)

```typescript
// Memory Tools
remember    // Bilgi hatırla
recall      // Bilgi getir
forget      // Bilgi unut

// Multi-Agent Tools
list_agents    // Agent listesi
ask_agent      // Agent'a sor
delegate_task  // Görev devret
create_agent   // Yeni agent oluştur

// Task Tools
create_task    // Görev oluştur
list_tasks     // Görevleri listele
update_task    // Görev güncelle

// Utility Tools
calculate      // Hesaplama yap
```

### Paket Tool Sistemi (package-runtime.service.ts)

```typescript
// Agent için paket tool'larını yükle
packageRuntime.getToolsForAgent(agentId)

// System prompt eklerini yükle
packageRuntime.getSystemPromptAdditions(agentId)

// Tüm context'i yükle
packageRuntime.getAgentPackageContext(agentId)

// Tool'un hangi pakete ait olduğunu bul
packageRuntime.findToolPackage(agentId, toolName)
```

### Tool Çağrı Akışı

```
1. Kullanıcı mesaj gönderir
2. agent-runtime.service.ts mesajı alır
3. packageRuntime.getAgentPackageContext() ile paket tool'ları yüklenir
4. LLM'e tüm tool'lar (builtin + paket) gönderilir
5. LLM tool_use yanıtı döndürürse:
   a. Önce builtin tool'larda aranır
   b. Bulunamazsa paket tool'larında aranır
   c. executeAgentTool() ile çalıştırılır
6. Sonuç kullanıcıya döndürülür
```

---

## 🎨 Frontend API Client (orbicorp-api.js)

### Temel Kullanım

```javascript
// Singleton instance
window.orbicorpAPI = new OrbicorpAPI();

// Login
const result = await orbicorpAPI.login(email, password);

// API çağrısı
const agents = await orbicorpAPI.getAgents();

// Token yönetimi otomatik (localStorage)
// orbicorp_access_token
// orbicorp_refresh_token
```

### Önemli Metodlar

```javascript
// Auth
login(email, password)
register(data)
logout()

// Agents
getAgents(params)
getAgent(id)
createAgent(data)
updateAgent(id, data)
deleteAgent(id)
pauseAgent(id)
resumeAgent(id)

// Sessions
getSessions(params)
createSession(agentId)
sendMessage(sessionId, content)  // Streaming

// Market
getMarketPackages(params)
getMarketPackage(id)
installPackage(packageId)
uninstallPackage(installationId)
getInstalledPackages()
assignPackageToAgent(agentId, installationId)
removePackageFromAgent(agentId, agentPackageId)
getAgentPackages(agentId)
updateAgentPackage(agentId, apId, data)

// LLM
getLLMConfig()
saveLLMConfig(provider, config)
```

---

## 🔐 Authentication Sistemi

### JWT Token Yapısı

```typescript
interface JWTPayload {
  userId: string;
  companyId: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}
```

### Middleware (auth.ts)

```typescript
// Temel auth
export async function authMiddleware(request, reply)

// Rol bazlı erişim
export function requireRole(...allowedRoles: string[])

// Kısayollar
export const requireAdmin = requireRole('ADMIN');
export const requireOperator = requireRole('ADMIN', 'OPERATOR');
export const requireViewer = requireRole('ADMIN', 'OPERATOR', 'VIEWER');

// Authenticated request tipi
export interface AuthenticatedRequest<T = unknown> extends FastifyRequest<T> {
  user: JWTPayload;
}
```

---

## 📦 Seed Data

### Demo Şirket & Kullanıcı

```
Şirket: NovaTech Solutions A.Ş.
Slug: novatech
ID: Dinamik UUID

Admin Kullanıcı:
Email: admin@novatech.com.tr
Şifre: admin123
```

### Seed Paketler (8 adet)

| Paket | Tip | Araçlar |
|-------|-----|---------|
| memory-tools 🧠 | SKILL | remember, recall, forget |
| multi-agent 🤖 | SKILL | list_agents, ask_agent, delegate_task, create_agent |
| task-manager ✅ | SKILL | create_task, list_tasks, update_task |
| calculator 🧮 | TOOL | calculate |
| hr-assistant-template 👔 | AGENT_TEMPLATE | - |
| sales-assistant-template 💼 | AGENT_TEMPLATE | - |
| lang-en 🇬🇧 | LANGUAGE_PACK | - |
| lang-de 🇩🇪 | LANGUAGE_PACK | - |

---

## 🔄 Önemli Değişken İsimleri

### Backend

```typescript
// Services (singleton)
agentsService
usersService
marketService
packageRuntime
agentRuntime

// Request user
request.user.companyId
request.user.userId
request.user.role

// Prisma client
import prisma from '../../shared/utils/prisma.js';
```

### Frontend

```javascript
// Global API client
window.orbicorpAPI

// LocalStorage keys
'orbicorp_access_token'
'orbicorp_refresh_token'

// Agents page state
let agents = [];
let currentEditAgent = null;
let selectedIds = new Set();

// Market page state
let allPackages = [];
let installedPackages = [];
let categories = [];
let agents = [];
let currentModalPackage = null;
```

---

## 🐛 Bilinen Sorunlar & Çözümler

### 1. "preHandler hook undefined" Hatası
**Sorun:** `authenticate` fonksiyonu export edilmemiş
**Çözüm:** `authMiddleware` kullan

### 2. "phone field not found" Hatası
**Sorun:** User modelinde phone/department yok
**Çözüm:** schema.prisma'ya ekle + migration

### 3. Script tag template literal içinde
**Sorun:** `<script>` tag'ı JS parser'ı bozuyor
**Çözüm:** Inline script yerine fonksiyon çağrısı kullan

### 4. Agent tool'ları çalışmıyor
**Sorun:** Model tool calling desteklemiyor
**Çözüm:** claude-sonnet-4-20250514 veya üstü kullan

---

## 🚀 Geliştirme Komutları

```powershell
# Backend başlat
cd orbicorp-server
npm run dev

# Frontend başlat (ayrı terminal)
cd orbicorp-frontend
npx http-server -p 8000

# Prisma migration
npx prisma generate
npx prisma migrate dev --name <migration_name>

# Seed çalıştır
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-market.ts

# Database reset
npx prisma migrate reset
```

---

## 📝 Sonraki Geliştirmeler (TODO)

- [ ] Company sayfası backend bağlantısı
- [ ] Analytics sayfası backend bağlantısı
- [ ] Knowledge sayfası (RAG) backend bağlantısı
- [ ] History sayfası backend bağlantısı
- [ ] Model kullanım maliyeti takibi
- [ ] Paket değerlendirme sistemi
- [ ] Workflow template desteği
- [ ] Çoklu dil paketleri aktif kullanımı

---

## 📅 Oturum Geçmişi

### 2026-03-30: Skill Market Sistemi
- Paket şeması tasarımı
- Database tabloları (MarketPackage, PackageInstallation, AgentPackage)
- Market API endpoints (14 endpoint)
- Seed data (8 paket)
- Agent runtime entegrasyonu (package-runtime.service.ts)
- Frontend market sayfası
- Agent sayfasına paket yönetimi
- Bug fixes (auth middleware, script tag, phone field)

---

**Dokümantasyon Versiyonu:** 1.0  
**Son Güncelleme:** 2026-03-30
