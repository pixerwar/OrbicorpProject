# CLAUDE.md - Orbicorp AI Agent Platform

## Proje Yapısı

```
orbicorp-full/
├── orbicorp-frontend/          # Vanilla HTML/CSS/JS
│   ├── orbicorp-api.js         # API client (tüm endpoint'ler)
│   ├── orbicorp-*.html         # Sayfa dosyaları
│   └── orbicorp-dark.css       # Dark tema
└── orbicorp-server/            # Node.js + Fastify + TypeScript
    ├── src/
    │   ├── app.ts              # Route kayıtları
    │   ├── modules/            # Feature modülleri
    │   └── shared/middleware/auth.ts
    └── prisma/schema.prisma    # DB şeması
```

## Teknoloji

- **Backend:** Node.js 18+, Fastify 4, TypeScript, Prisma 5, PostgreSQL, Zod
- **Frontend:** Vanilla JS, iframe yapısı, CSS Variables
- **LLM:** Anthropic, OpenAI, Google, OpenRouter

## Veritabanı Tabloları

```
Company, User, Agent, AgentMemory, Session, Message, 
Task, Workflow, CommunicationChannel, Notification,
MarketPackage, PackageInstallation, AgentPackage, PackageReview
```

## Önemli Enum'lar

```prisma
UserRole: ADMIN | OPERATOR | VIEWER
AgentStatus: ACTIVE | PAUSED | MAINTENANCE
MemoryType: FACT | PREFERENCE | LEARNING
PackageType: SKILL | TOOL | AGENT_TEMPLATE | LANGUAGE_PACK | WORKFLOW_TEMPLATE
```

---

## Backend Değişkenler & Metodlar

### Auth Middleware (src/shared/middleware/auth.ts)

```typescript
authMiddleware          // JWT doğrulama
requireRole(...roles)   // Rol kontrolü
requireAdmin            // ADMIN gerekli
requireOperator         // ADMIN veya OPERATOR
AuthenticatedRequest<T> // Tip: request.user içerir
```

### Request User

```typescript
request.user.userId
request.user.companyId
request.user.email
request.user.role
```

### Prisma Client

```typescript
import prisma from '../../shared/utils/prisma.js';
// veya
import { prisma } from '../../shared/utils/prisma.js';
```

### Agent Runtime (src/modules/agent-runtime/)

```typescript
// agent-runtime.service.ts
agentRuntime.chatStream(sessionId, content, onChunk)
agentRuntime.executeAgentTool(agent, toolName, toolInput)

// package-runtime.service.ts
packageRuntime.getToolsForAgent(agentId)
packageRuntime.getSystemPromptAdditions(agentId)
packageRuntime.getAgentPackageContext(agentId)
packageRuntime.findToolPackage(agentId, toolName)
```

### Builtin Tools (llm-types.ts)

```typescript
// Memory
remember, recall, forget

// Multi-Agent
list_agents, ask_agent, delegate_task, create_agent

// Tasks
create_task, list_tasks, update_task

// Utility
calculate
```

### Service Pattern

```typescript
// Her modülde: index.ts, *.routes.ts, *.schema.ts, *.service.ts
import { agentsService } from './agents.service.js';
import { marketService } from './market.service.js';
```

---

## Frontend Değişkenler & Metodlar

### API Client (orbicorp-api.js)

```javascript
window.orbicorpAPI  // Global singleton

// Auth
.login(email, password)
.logout()

// Agents
.getAgents(params)
.getAgent(id)
.createAgent(data)
.updateAgent(id, data)
.deleteAgent(id)
.pauseAgent(id)
.resumeAgent(id)

// Sessions
.getSessions()
.createSession(agentId)
.sendMessage(sessionId, content)  // Streaming

// Market
.getMarketPackages(params)
.installPackage(packageId)
.uninstallPackage(installationId)
.getInstalledPackages()
.assignPackageToAgent(agentId, installationId)
.removePackageFromAgent(agentId, apId)
.getAgentPackages(agentId)
.updateAgentPackage(agentId, apId, data)

// LLM
.getLLMConfig()
.saveLLMConfig(provider, config)
```

### LocalStorage Keys

```javascript
'orbicorp_access_token'
'orbicorp_refresh_token'
```

### Sayfa State Değişkenleri

```javascript
// orbicorp-agents.html
let agents = [];
let currentEditAgent = null;
let selectedIds = new Set();

// orbicorp-market.html
let allPackages = [];
let installedPackages = [];
let categories = [];
let currentModalPackage = null;
```

---

## API Endpoints

```
Auth:    POST /api/v1/auth/login|register|refresh|logout
Users:   GET|POST /api/v1/users, GET|PUT|DELETE /api/v1/users/:id
Agents:  GET|POST /api/v1/agents, GET|PUT|DELETE /api/v1/agents/:id
         GET /api/v1/agents/main, POST /api/v1/agents/:id/pause|resume
Sessions: GET|POST /api/v1/sessions, GET /api/v1/sessions/:id/messages
          POST /api/v1/sessions/:id/messages (streaming)
Market:  GET /api/v1/market, GET /api/v1/market/:id
         POST /api/v1/market/install, DELETE /api/v1/market/uninstall/:id
         GET /api/v1/market/installed
         POST|GET|DELETE|PATCH /api/v1/market/agents/:agentId/packages
LLM:     GET|POST /api/v1/llm/config
```

---

## Komutlar

```bash
# Backend
cd orbicorp-server && npm run dev

# Frontend
cd orbicorp-frontend && npx http-server -p 8000

# Prisma
npx prisma generate
npx prisma migrate dev --name <name>
npx prisma migrate reset

# Seed
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-market.ts
```

---

## Demo Credentials

```
Email: admin@novatech.com.tr
Password: admin123
Company: NovaTech Solutions A.Ş.
```

---

## Sık Hatalar

| Hata | Çözüm |
|------|-------|
| `authenticate is not defined` | `authMiddleware` kullan |
| `phone field not found` | schema.prisma'ya phone ekle + migrate |
| `preHandler hook undefined` | Import kontrol et |
| Template literal içinde `<script>` | Fonksiyon çağrısı kullan |
| Tool çalışmıyor | claude-sonnet-4-20250514 modeli kullan |

---

## Dosya Düzenleme Kuralları

1. **Route ekleme:** `app.ts`'e import + register
2. **Yeni modül:** `src/modules/<name>/` altında index.ts, routes.ts, schema.ts, service.ts
3. **DB değişikliği:** schema.prisma → `npx prisma migrate dev`
4. **Frontend API:** orbicorp-api.js'e metod ekle
5. **Yeni sayfa:** orbicorp-*.html formatında, iframe'de açılır
