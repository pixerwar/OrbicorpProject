# Orbicorp Frontend

Orbicorp AI Agent Platform - Frontend (Static HTML/CSS/JS)

## Dosya Yapısı

```
orbicorp-frontend/
├── index.html              # Ana shell (sidebar + topnav + iframe)
├── orbicorp-dashboard.html # Dashboard sayfası
├── orbicorp-agents.html    # Agent yönetimi
├── orbicorp-chat.html      # Chat arayüzü
├── orbicorp-chat-rag.html  # RAG destekli chat
├── orbicorp-users.html     # Kullanıcı yönetimi
├── orbicorp-company.html   # Şirket ayarları
├── orbicorp-settings.html  # Genel ayarlar
├── orbicorp-analytics.html # Analytics
├── orbicorp-tasks.html     # Görev yönetimi
├── orbicorp-workflow.html  # Workflow builder
├── orbicorp-knowledge.html # Bilgi tabanı (RAG)
├── orbicorp-market.html    # Skill marketplace
├── orbicorp-history.html   # Sohbet geçmişi
├── orbicorp-dark.css       # Dark mode stilleri
├── i18n.js                 # Çoklu dil desteği (TR/EN)
├── orbicorp-api.js         # Backend API client ⭐
├── llm_providers.js        # LLM provider tanımları
└── rag_engine_v2.js        # RAG engine (client-side)
```

## Çalıştırma

```bash
# Basit HTTP server ile
cd orbicorp-frontend
npx serve .

# veya Python ile
python3 -m http.server 8000

# Tarayıcıda aç
open http://localhost:8000
```

## Backend Bağlantısı

Frontend varsayılan olarak `http://localhost:3001` adresindeki backend'e bağlanır.

### API Client Kullanımı

```javascript
// Login
const result = await orbicorpAPI.login('admin@novatech.com.tr', 'admin123');

// Agent listesi
const agents = await orbicorpAPI.getAgents();

// Chat session başlat
const session = await orbicorpAPI.createSession(agentId);

// Mesaj gönder (non-streaming)
const response = await orbicorpAPI.sendMessage(sessionId, 'Merhaba!');

// Streaming chat
for await (const chunk of orbicorpAPI.chatStream(sessionId, 'Merhaba!')) {
  if (chunk.content) {
    console.log(chunk.content); // Her chunk geldiğinde
  }
}
```

## Tema Değiştirme

```javascript
// Light/Dark mode
document.documentElement.setAttribute('data-theme', 'dark');
```

## Dil Değiştirme

```javascript
// Türkçe/İngilizce
window._orbicorpLang = 'en';
applyPageLang('en');
```

## Önemli Notlar

1. **iframe Yapısı**: Alt sayfalar `index.html` içinde iframe olarak yüklenir
2. **Tema Senkronizasyonu**: Ana sayfa tema değişikliğini iframe'lere `postMessage` ile iletir
3. **Mock vs Gerçek API**: Backend çalışmıyorsa sayfalar mock veri ile çalışır
