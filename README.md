# Orbicorp - AI Agent Management Platform

Kurumsal AI agent yönetim platformu. Multi-tenant, multi-model, enterprise-ready.

## 🏗️ Proje Yapısı

```
orbicorp-full/
├── orbicorp-server/        # Backend (Node.js + Fastify + Prisma)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # JWT authentication
│   │   │   ├── agents/         # Agent CRUD
│   │   │   ├── sessions/       # Chat sessions
│   │   │   ├── users/          # User management
│   │   │   ├── companies/      # Company settings
│   │   │   └── agent-runtime/  # LLM orchestration
│   │   └── ...
│   ├── prisma/                 # Database schema
│   └── docker-compose.yml      # PostgreSQL + Redis
│
└── orbicorp-frontend/      # Frontend (Static HTML/CSS/JS)
    ├── index.html              # Main shell
    ├── orbicorp-*.html         # Page modules
    ├── orbicorp-api.js         # API client
    └── ...
```

## 🚀 Hızlı Başlangıç

### 1. Backend Kurulumu

```bash
cd orbicorp-server

# Environment variables
cp .env.example .env
# .env dosyasını düzenle (JWT secrets, LLM API keys)

# Docker ile PostgreSQL + Redis başlat
docker-compose up -d

# Bağımlılıkları yükle
npm install

# Veritabanını hazırla
npm run db:generate
npm run db:migrate
npm run db:seed

# Sunucuyu başlat
npm run dev
```

### 2. Frontend Kurulumu

```bash
cd orbicorp-frontend

# HTTP server başlat
npx serve . -p 8000

# veya
python3 -m http.server 8000
```

### 3. Tarayıcıda Aç

- **Frontend**: http://localhost:8000
- **Backend API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/docs

### Demo Kullanıcı

```
Email:    admin@novatech.com.tr
Password: admin123
```

## 🤖 LLM Yapılandırması

`.env` dosyasına API key ekleyin:

```bash
# Seçenek 1: OpenRouter (ÖNERİLEN - tek key ile 200+ model)
OPENROUTER_API_KEY="sk-or-v1-..."

# Seçenek 2: Direkt provider key'leri
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."
GOOGLE_API_KEY="..."
```

### Desteklenen Modeller

| Provider | Modeller |
|----------|----------|
| **OpenRouter** | Claude, GPT, Gemini, Llama, Mistral, DeepSeek, Qwen... |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo |
| **Google** | Gemini 1.5 Pro, Gemini 1.5 Flash |

## 📡 API Endpoints

### Auth
```
POST /api/v1/auth/register   - Kayıt
POST /api/v1/auth/login      - Giriş
POST /api/v1/auth/refresh    - Token yenile
POST /api/v1/auth/logout     - Çıkış
GET  /api/v1/auth/me         - Kullanıcı bilgisi
```

### Agents
```
GET    /api/v1/agents        - Listele
POST   /api/v1/agents        - Oluştur
GET    /api/v1/agents/:id    - Detay
PUT    /api/v1/agents/:id    - Güncelle
DELETE /api/v1/agents/:id    - Sil
```

### Sessions & Chat
```
POST   /api/v1/sessions              - Session başlat
GET    /api/v1/sessions/:id/messages - Mesajları getir
POST   /api/v1/sessions/:id/messages - Mesaj gönder
GET    /api/v1/sessions/:id/chat/stream - Streaming (SSE)
```

### LLM
```
GET  /api/v1/llm/status      - Provider durumu
GET  /api/v1/llm/providers   - Model listesi
POST /api/v1/llm/test        - Bağlantı testi
POST /api/v1/llm/benchmark   - Karşılaştırma
```

## 🎨 Frontend Özellikleri

- **Multi-tenant**: Şirket bazlı izolasyon
- **Dark/Light Mode**: Tema desteği
- **i18n**: Türkçe/İngilizce
- **Responsive**: Mobil uyumlu
- **Real-time**: SSE ile streaming chat

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Cache**: Redis
- **Auth**: JWT + Refresh Token

### Frontend
- **UI**: Vanilla HTML/CSS/JS
- **Icons**: Lucide
- **Styling**: Custom CSS + Dark mode

## 📋 Sonraki Adımlar

- [ ] Knowledge Base (RAG) entegrasyonu
- [ ] Workflow Engine
- [ ] WebSocket notifications
- [ ] File upload / S3 integration
- [ ] Slack/Teams integration

## 📄 Lisans

Proprietary - All rights reserved
