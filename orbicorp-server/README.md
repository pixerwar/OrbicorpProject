# Orbicorp Server

Orbicorp AI Agent Platform - Backend API

## Gereksinimler

- Node.js 20+
- Docker & Docker Compose
- Git

## Hızlı Başlangıç

### 1. Repoyu klonla

```bash
git clone <repo-url>
cd orbicorp-server
```

### 2. Environment variables

```bash
cp .env.example .env
# .env dosyasını düzenle (JWT_SECRET ve JWT_REFRESH_SECRET değiştir!)
```

### 3. Docker ile PostgreSQL ve Redis başlat

```bash
npm run docker:up
```

### 4. Bağımlılıkları yükle

```bash
npm install
```

### 5. Veritabanını hazırla

```bash
# Prisma client oluştur
npm run db:generate

# Migration uygula
npm run db:migrate

# Demo verilerle doldur
npm run db:seed
```

### 6. Sunucuyu başlat

```bash
npm run dev
```

Sunucu şurada çalışacak:
- **API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/docs
- **Health Check**: http://localhost:3001/health

## Demo Kullanıcı

```
Email:    admin@novatech.com.tr
Password: admin123
```

## API Endpoints

### Auth
```
POST /api/v1/auth/register   - Yeni şirket + admin kaydı
POST /api/v1/auth/login      - Giriş yap
POST /api/v1/auth/refresh    - Token yenile
POST /api/v1/auth/logout     - Çıkış yap
GET  /api/v1/auth/me         - Mevcut kullanıcı bilgisi
```

### Agents
```
GET    /api/v1/agents        - Agent listele
POST   /api/v1/agents        - Yeni agent oluştur
GET    /api/v1/agents/:id    - Agent detayı
PUT    /api/v1/agents/:id    - Agent güncelle
DELETE /api/v1/agents/:id    - Agent sil
POST   /api/v1/agents/:id/pause   - Agent duraklat
POST   /api/v1/agents/:id/resume  - Agent devam ettir
GET    /api/v1/agents/:id/stats   - Agent istatistikleri
```

### Sessions & Chat
```
GET    /api/v1/sessions           - Session listele
POST   /api/v1/sessions           - Yeni session başlat
GET    /api/v1/sessions/:id       - Session detayı
POST   /api/v1/sessions/:id/end   - Session sonlandır
DELETE /api/v1/sessions/:id       - Session sil
GET    /api/v1/sessions/:id/messages      - Mesajları getir
POST   /api/v1/sessions/:id/messages      - Mesaj gönder (non-streaming)
GET    /api/v1/sessions/:id/chat/stream   - Streaming chat (SSE)
```

### Users
```
GET    /api/v1/users              - Kullanıcı listele (manager+)
POST   /api/v1/users              - Kullanıcı oluştur (admin)
GET    /api/v1/users/:id          - Kullanıcı detayı
PUT    /api/v1/users/:id          - Kullanıcı güncelle
DELETE /api/v1/users/:id          - Kullanıcı sil (admin)
GET    /api/v1/users/stats        - Kullanıcı istatistikleri
POST   /api/v1/users/change-password - Şifre değiştir
```

### Company
```
GET    /api/v1/company            - Şirket bilgileri
PUT    /api/v1/company            - Şirket güncelle (admin)
PUT    /api/v1/company/branding   - Marka ayarları (admin)
GET    /api/v1/company/stats      - Dashboard istatistikleri
```

### LLM
```
GET    /api/v1/llm/status         - LLM yapılandırma durumu
GET    /api/v1/llm/providers      - Mevcut provider ve modeller
POST   /api/v1/llm/test           - LLM bağlantı testi (admin)
POST   /api/v1/llm/benchmark      - Tüm provider'ları karşılaştır (admin)
```

## Proje Yapısı

```
orbicorp-server/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Fastify app setup
│   ├── config/               # Environment config
│   ├── modules/
│   │   ├── auth/             # Authentication
│   │   ├── agents/           # Agent CRUD
│   │   ├── users/            # (TODO) User management
│   │   └── ...
│   └── shared/
│       ├── middleware/       # Auth middleware
│       ├── utils/            # Prisma, helpers
│       └── types/            # TypeScript types
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── seed.ts               # Demo data
├── docker-compose.yml        # PostgreSQL + Redis
└── package.json
```

## Scriptler

```bash
npm run dev          # Development mode (hot reload)
npm run build        # TypeScript compile
npm run start        # Production mode

npm run db:generate  # Prisma client oluştur
npm run db:migrate   # Migration uygula
npm run db:push      # Schema'yı doğrudan uygula (dev)
npm run db:studio    # Prisma Studio (GUI)
npm run db:seed      # Demo verileri yükle

npm run docker:up    # PostgreSQL + Redis başlat
npm run docker:down  # Container'ları durdur
npm run docker:logs  # Container logları
```

## Sonraki Adımlar

- [x] Auth (login, register, JWT)
- [x] Agents CRUD
- [x] Sessions & Chat (streaming dahil)
- [x] Users CRUD
- [x] Company settings
- [x] Agent Runtime (gerçek LLM calls) ✨
- [ ] Workflows Engine
- [ ] Knowledge Base (RAG)
- [ ] WebSocket (real-time notifications)

## LLM Yapılandırması

Gerçek AI yanıtları için `.env` dosyasına API key ekleyin:

```bash
# Seçenek 1: OpenRouter (ÖNERİLEN - tek key ile 200+ model)
OPENROUTER_API_KEY="sk-or-..."

# Seçenek 2: Direkt provider key'leri
ANTHROPIC_API_KEY="sk-ant-..."   # Claude
OPENAI_API_KEY="sk-..."          # GPT
GOOGLE_API_KEY="..."             # Gemini
```

### OpenRouter Avantajları
- **Tek API key** ile Claude, GPT, Gemini, Llama, Mistral hepsine erişim
- **Otomatik failover** — bir provider dolunca diğerine geçer
- **En ucuz fiyat** — aynı model için en uygun provider'ı seçer

API key eklenmezse sistem mock yanıtlar döner.

## Lisans

Proprietary - All rights reserved
