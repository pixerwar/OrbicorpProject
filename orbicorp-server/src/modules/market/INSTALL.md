# Orbicorp Skill Market - Kurulum Rehberi

## 📦 Dosya Yapısı

```
orbicorp-packages/
├── schema/
│   └── package-manifest.schema.json   # Paket manifest JSON Schema
├── examples/                          # Örnek paketler (referans)
├── database/
│   ├── schema.prisma                  # Güncellenmiş Prisma schema
│   ├── skill-market-tables.prisma     # Sadece yeni tablolar (referans)
│   └── seed-market.ts                 # Hazır paketler seed dosyası
└── api/
    ├── index.ts
    ├── market.routes.ts
    ├── market.schema.ts
    └── market.service.ts
```

---

## 🚀 Kurulum Adımları

### 1. Dosyaları Kopyala

```powershell
# Proje dizinine git
cd C:\Users\ervat\OneDrive\Desktop\orbicorp-full\orbicorp-server

# Schema dosyasını güncelle
# ZIP'ten çıkan database/schema.prisma → prisma/schema.prisma

# API modülünü oluştur
mkdir -p src/modules/market
# ZIP'ten çıkan api/*.ts → src/modules/market/

# Seed dosyasını kopyala
# ZIP'ten çıkan database/seed-market.ts → prisma/seed-market.ts
```

### 2. Migration Çalıştır

```powershell
# Prisma client regenerate
npx prisma generate

# Migration oluştur ve uygula
npx prisma migrate dev --name add_skill_market

# Eğer hata alırsan (mevcut data ile conflict):
npx prisma migrate dev --name add_skill_market --create-only
# Sonra migration SQL'i düzenle ve:
npx prisma migrate deploy
```

### 3. Seed Data Yükle

```powershell
# Seed dosyasını çalıştır
npx ts-node prisma/seed-market.ts

# Veya package.json'a script ekle:
# "seed:market": "ts-node prisma/seed-market.ts"
# npm run seed:market
```

### 4. Route'u Kaydet (app.ts)

```typescript
// app.ts dosyasına ekle:

import { marketRoutes } from './modules/market/index.js';

// ... mevcut route'ların altına:
await api.register(marketRoutes, { prefix: '/market' });
```

### 5. Test Et

```powershell
# Server'ı başlat
npm run dev

# API test (PowerShell)
Invoke-RestMethod -Uri "http://localhost:3001/api/v1/market" | ConvertTo-Json

# Veya curl
curl http://localhost:3001/api/v1/market
```

---

## 📊 Yeni Database Tabloları

| Tablo | Açıklama |
|-------|----------|
| `MarketPackage` | Tüm paketler (skill, tool, template, vb.) |
| `PackageInstallation` | Şirkete kurulu paketler |
| `AgentPackage` | Agent-paket atamaları |
| `PackageReview` | Paket değerlendirmeleri |

### İlişkiler

```
Company (1) ←→ (N) PackageInstallation ←→ (1) MarketPackage
                        ↓
              (N) AgentPackage ←→ (1) Agent
```

---

## 🔄 Eski Tablolardan Geçiş

Eski `Skill` ve `InstalledSkill` tabloları kaldırıldı. Eğer mevcut data varsa:

```sql
-- Eski dataları yedekle (opsiyonel)
CREATE TABLE _skill_backup AS SELECT * FROM "Skill";
CREATE TABLE _installed_skill_backup AS SELECT * FROM "InstalledSkill";

-- Migration sonrası eski tabloları sil
DROP TABLE IF EXISTS "InstalledSkill";
DROP TABLE IF EXISTS "Skill";
```

---

## ✅ Seed ile Eklenen Paketler

| Paket | Tip | Açıklama |
|-------|-----|----------|
| `memory-tools` | SKILL | Hafıza araçları (remember, recall, forget) |
| `multi-agent` | SKILL | Çoklu agent yönetimi |
| `task-manager` | SKILL | Görev yönetimi |
| `calculator` | TOOL | Matematik hesaplamaları |
| `hr-assistant-template` | AGENT_TEMPLATE | İK asistan şablonu |
| `sales-assistant-template` | AGENT_TEMPLATE | Satış asistan şablonu |
| `lang-en` | LANGUAGE_PACK | İngilizce dil paketi |
| `lang-de` | LANGUAGE_PACK | Almanca dil paketi |

---

## 🔗 API Endpoints Özeti

### Public
- `GET /api/v1/market` - Paketleri listele
- `GET /api/v1/market/:id` - Paket detayı
- `GET /api/v1/market/by-name/:name` - İsimle bul

### Authenticated
- `POST /api/v1/market/install` - Paket kur
- `DELETE /api/v1/market/uninstall/:id` - Paket kaldır
- `GET /api/v1/market/installed` - Kurulu paketler

### Agent-Package
- `GET /api/v1/market/agents/:agentId/packages` - Agent paketleri
- `POST /api/v1/market/agents/:agentId/packages` - Paket ata
- `DELETE /api/v1/market/agents/:agentId/packages/:id` - Kaldır

---

## ⚠️ Olası Sorunlar

### "Relation does not exist" hatası
```powershell
npx prisma migrate reset  # DİKKAT: Tüm data silinir!
npx prisma migrate dev
```

### "Column already exists" hatası
Migration dosyasını düzenle veya:
```powershell
npx prisma db push --force-reset  # DİKKAT: Tüm data silinir!
```

### Import hataları
```typescript
// .js uzantısını unutma
import { marketRoutes } from './modules/market/index.js';
```
