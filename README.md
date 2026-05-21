# Orbicorp - AI Agent Management Platform

An enterprise-grade AI agent management platform. Multi-tenant, multi-model, enterprise-ready.

## Introduction

**Orbicorp is an AI agent platform built for small and medium-sized businesses (SMBs)** that want the productivity of custom AI assistants without the cost and complexity of building one from scratch. Instead of juggling separate chatbots, automation tools, and integrations, your team manages a fleet of purpose-built AI agents from a single, multi-tenant dashboard.

Each agent can be tailored to a specific role — customer support, sales follow-up, HR onboarding, internal knowledge lookup — and put to work across the channels your customers already use.

### Key Features

- **Custom AI agents, no code required** — Create, configure, pause, and manage role-specific agents (support, sales, HR, operations) from a simple web dashboard.
- **Bring your own model, avoid lock-in** — Connect Anthropic (Claude), OpenAI (GPT), Google (Gemini), or 200+ models through a single OpenRouter key, and switch providers anytime to control cost and quality.
- **Multi-channel customer engagement** — Reach customers where they are with built-in Telegram and WhatsApp messaging, plus a real-time streaming web chat.
- **Knowledge base (RAG)** — Ground agents in your own documents and company data so answers stay accurate and on-brand instead of generic.
- **Agent memory** — Agents remember facts, preferences, and past interactions, delivering a personalized experience that improves over time.
- **Multi-agent collaboration** — Agents can delegate tasks to one another and a coordinator agent, automating multi-step workflows end to end.
- **Task & workflow automation** — Turn repetitive business processes into tracked tasks and automated workflows that run without manual follow-up.
- **Skills marketplace** — Extend agents with installable skills, tools, language packs, and ready-made templates to launch faster.
- **Team & role management** — Invite teammates with role-based access (Admin, Operator, Viewer) and keep each company's data fully isolated.
- **Insights dashboard** — Track usage, activity, and agent performance to understand where AI is saving your team time.
- **Localized & accessible** — Turkish/English interface, dark/light themes, and a mobile-friendly responsive design out of the box.

### Why SMBs choose Orbicorp

- **Fast to launch** — Sensible defaults, seed data, and templates get you running in minutes, not months.
- **Affordable & flexible** — Pay only for the models you use and scale agents up or down as your needs change.
- **Self-hostable** — Runs on your own infrastructure with Docker (PostgreSQL + Redis), keeping your customer data under your control.

## 🏗️ Project Structure

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

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd orbicorp-server

# Environment variables
cp .env.example .env
# Edit the .env file (JWT secrets, LLM API keys)

# Start PostgreSQL + Redis with Docker
docker-compose up -d

# Install dependencies
npm install

# Prepare the database
npm run db:generate
npm run db:migrate
npm run db:seed

# Start the server
npm run dev
```

### 2. Frontend Setup

```bash
cd orbicorp-frontend

# Start an HTTP server
npx serve . -p 8000

# or
python3 -m http.server 8000
```

### 3. Open in the Browser

- **Frontend**: http://localhost:8000
- **Backend API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/docs

### Demo User

```
Email:    admin@novatech.com.tr
Password: admin123
```

## 🤖 LLM Configuration

Add your API key to the `.env` file:

```bash
# Option 1: OpenRouter (RECOMMENDED - 200+ models with a single key)
OPENROUTER_API_KEY="sk-or-v1-..."

# Option 2: Direct provider keys
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."
GOOGLE_API_KEY="..."
```

### Supported Models

| Provider | Models |
|----------|--------|
| **OpenRouter** | Claude, GPT, Gemini, Llama, Mistral, DeepSeek, Qwen... |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo |
| **Google** | Gemini 1.5 Pro, Gemini 1.5 Flash |

## 📡 API Endpoints

### Auth
```
POST /api/v1/auth/register   - Register
POST /api/v1/auth/login      - Login
POST /api/v1/auth/refresh    - Refresh token
POST /api/v1/auth/logout     - Logout
GET  /api/v1/auth/me         - Current user info
```

### Agents
```
GET    /api/v1/agents        - List
POST   /api/v1/agents        - Create
GET    /api/v1/agents/:id    - Details
PUT    /api/v1/agents/:id    - Update
DELETE /api/v1/agents/:id    - Delete
```

### Sessions & Chat
```
POST   /api/v1/sessions              - Start a session
GET    /api/v1/sessions/:id/messages - Get messages
POST   /api/v1/sessions/:id/messages - Send a message
GET    /api/v1/sessions/:id/chat/stream - Streaming (SSE)
```

### LLM
```
GET  /api/v1/llm/status      - Provider status
GET  /api/v1/llm/providers   - Model list
POST /api/v1/llm/test        - Connection test
POST /api/v1/llm/benchmark   - Comparison
```

## 🎨 Frontend Features

- **Multi-tenant**: Per-company isolation
- **Dark/Light Mode**: Theme support
- **i18n**: Turkish/English
- **Responsive**: Mobile-friendly
- **Real-time**: Streaming chat via SSE

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

## 📋 Roadmap

- [ ] Knowledge Base (RAG) integration
- [ ] Workflow Engine
- [ ] WebSocket notifications
- [ ] File upload / S3 integration
- [ ] Slack/Teams integration

## 📄 License

Proprietary - All rights reserved
